use crate::search::{self, ApiError, Engine, SearchRequest, SearchResponse};
use std::sync::{Arc, Mutex};
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{NewWindowResponse, WebviewBuilder};
use tauri::window::WindowBuilder;
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl};

struct SearchState {
    engine: Arc<Engine>,
    active: Mutex<Option<tokio::task::AbortHandle>>,
}

fn require_main(webview: &Webview) -> Result<(), ApiError> {
    if webview.label() != "main" { return Err(ApiError::new(403, "FORBIDDEN", "Only the search interface can use this command.")); }
    Ok(())
}

fn window_error(_: tauri::Error) -> ApiError {
    ApiError::new(500, "WINDOW_ERROR", "This page could not open. Please try again.")
}

#[tauri::command]
async fn search(request: SearchRequest, webview: Webview, state: State<'_, SearchState>) -> Result<SearchResponse, ApiError> {
    require_main(&webview)?;
    search::validate(&request)?;
    let engine = state.engine.clone();
    let task = tokio::spawn(async move { engine.search(request).await });
    {
        let mut active = state.active.lock().map_err(|_| ApiError::new(500, "SEARCH_ERROR", "Please restart Sreon."))?;
        if let Some(previous) = active.replace(task.abort_handle()) { previous.abort(); }
    }
    task.await.map_err(|_| ApiError::new(499, "CANCELLED", "A newer search replaced this search."))?
}

#[tauri::command]
async fn open_page(url: String, webview: Webview, app: AppHandle) -> Result<(), ApiError> {
    require_main(&webview)?;
    let url = search::web_url(&url).ok_or_else(|| ApiError::new(400, "INVALID_URL", "Enter a public HTTP or HTTPS website."))?;
    if let Some(page) = app.get_webview("page") {
        page.navigate(url).map_err(window_error)?;
        page.show().map_err(window_error)?;
        page.set_focus().map_err(window_error)?;
        return Ok(());
    }
    let window = app.get_window("main").ok_or_else(|| ApiError::new(500, "WINDOW_ERROR", "The app window is unavailable."))?;
    let size = window.inner_size().map_err(window_error)?.to_logical::<f64>(window.scale_factor().map_err(window_error)?);
    let page = WebviewBuilder::new("page", WebviewUrl::External(url))
        .incognito(true)
        .on_navigation(|url| search::web_url(url.as_str()).is_some())
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_page_load(|view, payload| {
            let _ = view.app_handle().emit_to("main", "sreon:location", payload.url().as_str());
            let _ = view.window().set_title(&format!("{} — Sreon", payload.url().origin().ascii_serialization()));
        });
    window.add_child(page, LogicalPosition::new(0.0, 72.0), LogicalSize::new(size.width, (size.height - 72.0).max(1.0))).map_err(window_error)?.set_focus().map_err(window_error)?;
    Ok(())
}

#[tauri::command]
async fn navigate(action: String, webview: Webview, app: AppHandle) -> Result<(), ApiError> {
    require_main(&webview)?;
    if let Some(page) = app.get_webview("page") {
        match action.as_str() {
            "search" => { page.hide().map_err(window_error)?; webview.set_focus().map_err(window_error)?; }
            "show" => { page.show().map_err(window_error)?; page.set_focus().map_err(window_error)?; }
            "back" => page.eval("history.back()").map_err(window_error)?,
            "forward" => page.eval("history.forward()").map_err(window_error)?,
            "reload" => page.reload().map_err(window_error)?,
            _ => return Err(ApiError::new(400, "INVALID_ACTION", "Unknown navigation action.")),
        }
    }
    Ok(())
}
fn menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let search = MenuItem::with_id(app, "focus-search", "Search", true, Some("CmdOrCtrl+L"))?;
    let back = MenuItem::with_id(app, "back", "Back", true, Some("CmdOrCtrl+["))?;
    let forward = MenuItem::with_id(app, "forward", "Forward", true, Some("CmdOrCtrl+]"))?;
    let reload = MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
    Menu::with_items(app, &[
        &Submenu::with_items(app, "Sreon", true, &[
            &PredefinedMenuItem::about(app, Some("About Sreon"), Some(AboutMetadata { name: Some("Sreon".into()), version: Some(env!("CARGO_PKG_VERSION").into()), ..Default::default() }))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ])?,
        &Submenu::with_items(app, "Edit", true, &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ])?,
        &Submenu::with_items(app, "Navigate", true, &[&search, &back, &forward, &reload])?,
    ])
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(SearchState { engine: Arc::new(Engine::new()?), active: Mutex::new(None) });
            let window = WindowBuilder::new(app, "main").title("Sreon").inner_size(1180.0, 820.0).min_inner_size(520.0, 560.0).build()?;
            let main = WebviewBuilder::new("main", WebviewUrl::App("index.html".into()))
                .on_navigation(|url| url.scheme() == "tauri" || (["http", "https"].contains(&url.scheme()) && url.host_str() == Some("tauri.localhost")))
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .auto_resize();
            window.add_child(main, LogicalPosition::new(0, 0), window.inner_size()?)?;
            let handle = app.handle().clone();
            window.on_window_event(move |event| {
                if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }) {
                    if let (Some(window), Some(page)) = (handle.get_window("main"), handle.get_webview("page")) {
                        if let (Ok(size), Ok(scale)) = (window.inner_size(), window.scale_factor()) {
                            let size = size.to_logical::<f64>(scale);
                            let _ = page.set_position(LogicalPosition::new(0.0, 72.0));
                            let _ = page.set_size(LogicalSize::new(size.width, (size.height - 72.0).max(1.0)));
                        }
                    }
                }
            });
            Ok(())
        })
        .menu(menu)
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "focus-search" {
                if let Some(main) = app.get_webview("main") { let _ = main.set_focus(); }
                let _ = app.emit_to("main", "sreon:focus-search", ());
            } else if let Some(page) = app.get_webview("page") {
                match event.id().as_ref() {
                    "back" => { let _ = page.eval("history.back()"); }
                    "forward" => { let _ = page.eval("history.forward()"); }
                    "reload" => { let _ = page.reload(); }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![search, open_page, navigate])
        .run(tauri::generate_context!())
        .expect("Could not start Sreon");
}
