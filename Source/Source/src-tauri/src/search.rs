use reqwest::{redirect::Policy, Client, Response};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet, VecDeque};
use std::net::IpAddr;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use url::{Host, Url};

const WEB_SOURCE: &str = "https://html.duckduckgo.com/html/";
const FEED_SOURCE: &str = "https://www.bing.com/search";
const MEDIA_SOURCE: &str = "https://commons.wikimedia.org/w/api.php";
const MAX_BYTES: usize = 3_000_000;
const CURSOR_FIELDS: &[&str] = &["s", "dc", "v", "o", "api", "vqd", "nextParams", "kl"];
static RESULTS: LazyLock<Selector> = LazyLock::new(|| Selector::parse("#links .web-result, .result.web-result").unwrap());
static TITLE: LazyLock<Selector> = LazyLock::new(|| Selector::parse("a.result__a, h2 a").unwrap());
static SNIPPET: LazyLock<Selector> = LazyLock::new(|| Selector::parse(".result__snippet").unwrap());
static FORMS: LazyLock<Selector> = LazyLock::new(|| Selector::parse("form").unwrap());
static INPUTS: LazyLock<Selector> = LazyLock::new(|| Selector::parse("input[name]").unwrap());
static NEXT: LazyLock<Selector> = LazyLock::new(|| Selector::parse("input[type=submit], button").unwrap());
static EMPTY: LazyLock<Selector> = LazyLock::new(|| Selector::parse(".no-results, .no-results__message").unwrap());
static CHALLENGE: LazyLock<Selector> = LazyLock::new(|| Selector::parse("#challenge-form, .anomaly-modal, #anomaly-modal").unwrap());

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub status: u16,
    pub code: &'static str,
    pub message: String,
}

impl ApiError {
    pub fn new(status: u16, code: &'static str, message: impl Into<String>) -> Self {
        Self { status, code, message: message.into() }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "source", rename_all = "snake_case", deny_unknown_fields)]
pub enum SearchCursor {
    Web { fields: BTreeMap<String, String> },
    Media { offset: usize },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SearchRequest {
    pub q: String,
    #[serde(default)]
    pub category: Category,
    #[serde(default)]
    pub cursor: Option<SearchCursor>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
    pub thumbnail: Option<String>,
    pub credit: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<SearchResult>,
    pub elapsed: f64,
    pub next_cursor: Option<SearchCursor>,
    pub notice: Option<String>,
    pub overview: Vec<SearchResult>,
    pub cached: bool,
}

pub fn client() -> Result<Client, reqwest::Error> {
    Client::builder()
        .https_only(true)
        .redirect(Policy::custom(|attempt| {
            let host = attempt.url().host_str().unwrap_or("");
            let allowed = ["bing.com", "duckduckgo.com", "commons.wikimedia.org"].iter().any(|domain| host == *domain || host.ends_with(&format!(".{domain}")));
            if attempt.previous().len() < 3 && attempt.url().scheme() == "https" && allowed { attempt.follow() } else { attempt.stop() }
        }))
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(7))
        .pool_idle_timeout(Duration::from_secs(60))
        .pool_max_idle_per_host(2)
        .user_agent("Sreon/0.4.0 (https://github.com/FellowPythonCoder/Sreon-Browser)")
        .build()
}

fn blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() || ip.is_multicast() || ip.is_broadcast(),
        IpAddr::V6(ip) => {
            if let Some(ip) = ip.to_ipv4_mapped() { return blocked_ip(IpAddr::V4(ip)); }
            ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() || ip.segments()[0] & 0xfe00 == 0xfc00 || ip.segments()[0] & 0xffc0 == 0xfe80
        }
    }
}

pub fn web_url(raw: &str) -> Option<Url> {
    let url = Url::parse(raw).ok()?;
    let blocked = match url.host() {
        Some(Host::Domain(host)) => {
            let host = host.trim_end_matches('.').to_ascii_lowercase();
            host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local")
        }
        Some(Host::Ipv4(ip)) => blocked_ip(IpAddr::V4(ip)),
        Some(Host::Ipv6(ip)) => blocked_ip(IpAddr::V6(ip)),
        None => true,
    };
    if raw.len() > 8192 || !["https", "http"].contains(&url.scheme()) || blocked || !url.username().is_empty() || url.password().is_some() { return None; }
    Some(url)
}

pub fn validate(request: &SearchRequest) -> Result<(), ApiError> {
    let invalid = || ApiError::new(400, "INVALID_QUERY", "Enter a search of 1–500 characters and try again.");
    if request.q.trim().is_empty() || request.q.chars().count() > 500 { return Err(invalid()); }
    if let Some(cursor) = &request.cursor {
        let media = matches!(request.category, Category::Images | Category::Photos);
        if media != matches!(cursor, SearchCursor::Media { .. }) { return Err(invalid()); }
        match cursor {
            SearchCursor::Web { fields } => {
                if fields.len() > CURSOR_FIELDS.len() || !fields.contains_key("s") || !fields.contains_key("vqd") { return Err(invalid()); }
                for (name, value) in fields {
                    if !CURSOR_FIELDS.contains(&name.as_str()) || value.len() > 2048 { return Err(invalid()); }
                }
                if !fields.get("s").and_then(|value| value.parse::<usize>().ok()).is_some_and(|value| (1..=500).contains(&value)) { return Err(invalid()); }
            }
            SearchCursor::Media { offset } => if !(1..=500).contains(offset) { return Err(invalid()); },
        }
    }
    Ok(())
}

fn plain_text(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(3000).collect()
}

fn clean_text(raw: &str) -> String {
    let fragment = Html::parse_fragment(raw);
    plain_text(&fragment.root_element().text().collect::<Vec<_>>().join(" "))
}

fn result_url(raw: &str) -> Option<Url> {
    let mut url = if raw.starts_with('/') {
        Url::parse(WEB_SOURCE).ok()?.join(raw).ok()?
    } else { Url::parse(raw).ok()? };
    let host = url.host_str()?;
    if host == "duckduckgo.com" || host.ends_with(".duckduckgo.com") {
        if url.path().ends_with("y.js") { return None; }
        if url.path().starts_with("/l/") {
            let target = url.query_pairs().find(|(key, _)| key == "uddg")?.1.into_owned();
            url = Url::parse(&target).ok()?;
        }
    }
    let mut safe = web_url(url.as_str())?;
    safe.set_fragment(None);
    Some(safe)
}

pub fn parse_web(html: &str) -> Result<SearchResponse, ApiError> {
    let unavailable = || ApiError::new(502, "SOURCE_UNAVAILABLE", "Web search is temporarily unavailable. Please try again in a moment.");
    let document = Html::parse_document(html);
    if document.select(&CHALLENGE).next().is_some() { return Err(unavailable()); }
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for item in document.select(&RESULTS).take(60) {
        if item.value().classes().any(|class| class.starts_with("result--ad")) { continue; }
        let Some(link) = item.select(&TITLE).next() else { continue; };
        let Some(url) = link.value().attr("href").and_then(result_url) else { continue; };
        let title = plain_text(&link.text().collect::<Vec<_>>().join(" "));
        if title.is_empty() || !seen.insert(url.to_string()) { continue; }
        let content = item.select(&SNIPPET).next().map(|snippet| plain_text(&snippet.text().collect::<Vec<_>>().join(" "))).unwrap_or_default();
        results.push(SearchResult { title, url: url.to_string(), content, thumbnail: None, credit: None });
    }
    if results.is_empty() && document.select(&EMPTY).next().is_none() { return Err(unavailable()); }
    let mut next_cursor = None;
    if !results.is_empty() {
        for form in document.select(&FORMS) {
            let is_next = form.select(&NEXT).any(|control| {
                control.value().attr("value").unwrap_or("").eq_ignore_ascii_case("next") || control.text().collect::<String>().trim().eq_ignore_ascii_case("next")
            });
            if !is_next { continue; }
            let fields: BTreeMap<String, String> = form.select(&INPUTS).filter_map(|input| {
                let name = input.value().attr("name")?;
                if !CURSOR_FIELDS.contains(&name) { return None; }
                Some((name.to_owned(), input.value().attr("value").unwrap_or("").to_owned()))
            }).collect();
            let cursor = SearchCursor::Web { fields };
            if validate(&SearchRequest { q: "pagination".into(), category: Category::Web, cursor: Some(cursor.clone()) }).is_ok() { next_cursor = Some(cursor); }
            break;
        }
    }
    Ok(SearchResponse { results, elapsed: 0.0, next_cursor, notice: None, overview: Vec::new(), cached: false })
}

fn web_form(request: &SearchRequest) -> Vec<(String, String)> {
    let mut fields = match &request.cursor {
        Some(SearchCursor::Web { fields }) => fields.clone(),
        _ => BTreeMap::from([("b".to_string(), String::new())]),
    };
    fields.insert("q".into(), if request.category == Category::Videos { format!("{} (site:youtube.com/watch OR site:vimeo.com OR site:dailymotion.com/video)", request.q.trim()) } else { request.q.trim().into() });
    fields.into_iter().collect()
}

async fn read_body(mut response: Response) -> Result<Vec<u8>, ApiError> {
    if !response.status().is_success() { return Err(ApiError::new(502, "SOURCE_UNAVAILABLE", "Search is temporarily unavailable. Please try again.")); }
    if response.content_length().is_some_and(|length| length > MAX_BYTES as u64) { return Err(ApiError::new(502, "RESPONSE_TOO_LARGE", "The search response was too large.")); }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if data.len() + chunk.len() > MAX_BYTES { return Err(ApiError::new(502, "RESPONSE_TOO_LARGE", "The search response was too large.")); }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}

async fn search_web(client: &Client, request: &SearchRequest) -> Result<SearchResponse, ApiError> {
    let response = client.post(WEB_SOURCE).header("Accept", "text/html").form(&web_form(request)).send().await.map_err(network_error)?;
    let bytes = read_body(response).await?;
    parse_web(&String::from_utf8_lossy(&bytes))
}

fn network_error(_: reqwest::Error) -> ApiError {
    ApiError::new(502, "SEARCH_UNAVAILABLE", "Search couldn't connect. Check your internet connection and try again.")
}


#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    #[default]
    Web,
    Images,
    Photos,
    Videos,
}

fn unavailable() -> ApiError {
    ApiError::new(502, "SEARCH_UNAVAILABLE", "Web search is unavailable right now. Please try again. Your search has not been replaced with encyclopedia results.")
}

pub fn parse_feed(xml: &str) -> Result<SearchResponse, ApiError> {
    let document = roxmltree::Document::parse(xml).map_err(|_| unavailable())?;
    if document.root_element().tag_name().name() != "rss" { return Err(unavailable()); }
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for item in document.descendants().filter(|node| node.has_tag_name("item")).take(50) {
        let field = |name| item.children().find(|node| node.has_tag_name(name)).and_then(|node| node.text()).unwrap_or("");
        let Some(url) = web_url(field("link")) else { continue; };
        let title = clean_text(field("title"));
        if title.is_empty() || !seen.insert(url.to_string()) { continue; }
        results.push(SearchResult { title, url: url.to_string(), content: clean_text(field("description")), thumbnail: None, credit: None });
    }
    Ok(SearchResponse { results, elapsed: 0.0, next_cursor: None, notice: None, overview: Vec::new(), cached: false })
}

async fn search_feed(client: &Client, request: &SearchRequest) -> Result<SearchResponse, ApiError> {
    let query = if request.category == Category::Videos { format!("{} (site:youtube.com/watch OR site:vimeo.com OR site:dailymotion.com/video)", request.q.trim()) } else { request.q.trim().to_owned() };
    let response = client.get(FEED_SOURCE).query(&[("format", "rss"), ("q", query.as_str()), ("count", "20")]).send().await.map_err(network_error)?;
    parse_feed(&String::from_utf8_lossy(&read_body(response).await?))
}

fn video_result(result: &mut SearchResult) -> bool {
    let Ok(url) = Url::parse(&result.url) else { return false; };
    let host = url.host_str().unwrap_or("").trim_start_matches("www.");
    if host == "youtube.com" || host == "m.youtube.com" || host == "youtu.be" {
        let id = if host == "youtu.be" { url.path().trim_start_matches('/').to_owned() } else if url.path().starts_with("/shorts/") { url.path().trim_start_matches("/shorts/").to_owned() } else { url.query_pairs().find(|(key, _)| key == "v").map(|(_, value)| value.into_owned()).unwrap_or_default() };
        if id.len() != 11 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') { return false; }
        result.thumbnail = Some(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"));
        return true;
    }
    (host == "vimeo.com" && url.path().chars().any(|c| c.is_ascii_digit())) || (host == "dailymotion.com" && url.path().starts_with("/video/"))
}

pub fn parse_media(data: Value) -> Result<SearchResponse, ApiError> {
    if data.get("error").is_some() || data.get("batchcomplete").is_none() && data.get("query").is_none() { return Err(unavailable()); }
    let mut entries = data.get("query").and_then(|q| q.get("pages")).and_then(Value::as_array).cloned().unwrap_or_default();
    entries.sort_by_key(|item| item.get("index").and_then(Value::as_i64).unwrap_or(i64::MAX));
    let results = entries.iter().filter_map(|item| {
        let info = item.get("imageinfo")?.as_array()?.first()?;
        let url = web_url(info.get("descriptionurl")?.as_str()?)?;
        if url.host_str()? != "commons.wikimedia.org" { return None; }
        let mut thumbnail = web_url(info.get("thumburl").or_else(|| info.get("url"))?.as_str()?)?;
        if thumbnail.scheme() != "https" || !["upload.wikimedia.org", "thumb.wikimedia.org"].contains(&thumbnail.host_str()?) { return None; }
        let params: Vec<(String, String)> = thumbnail.query_pairs().filter(|(key, _)| !key.starts_with("utm_")).map(|(key, value)| (key.into_owned(), value.into_owned())).collect();
        thumbnail.set_query(None);
        if !params.is_empty() { thumbnail.query_pairs_mut().extend_pairs(params); }
        let meta = |key: &str| clean_text(info.get("extmetadata").and_then(|m| m.get(key)).and_then(|m| m.get("value")).and_then(Value::as_str).unwrap_or(""));
        let credit = format!("{} · {}", meta("Artist").chars().take(180).collect::<String>(), meta("LicenseShortName"));
        Some(SearchResult { title: plain_text(item.get("title")?.as_str()?.trim_start_matches("File:")), url: url.to_string(), content: meta("ImageDescription").chars().take(500).collect(), thumbnail: Some(thumbnail.to_string()), credit: Some(credit) })
    }).take(24).collect::<Vec<_>>();
    let next_cursor = data.get("continue").and_then(|v| v.get("gsroffset")).and_then(Value::as_u64).filter(|offset| (1..=500).contains(offset)).filter(|_| !results.is_empty()).map(|offset| SearchCursor::Media { offset: offset as usize });
    Ok(SearchResponse { results, elapsed: 0.0, next_cursor, notice: Some("Images from Wikimedia Commons. Open a result for its original file and license.".into()), overview: Vec::new(), cached: false })
}

async fn search_media(client: &Client, request: &SearchRequest) -> Result<SearchResponse, ApiError> {
    let offset = match request.cursor { Some(SearchCursor::Media { offset }) => offset, _ => 0 };
    let query = format!("{} filetype:bitmap{}", request.q.trim(), if request.category == Category::Photos { " filemime:image/jpeg" } else { "" });
    let response = client.get(MEDIA_SOURCE).query(&[
        ("action", "query"), ("format", "json"), ("formatversion", "2"), ("generator", "search"), ("gsrnamespace", "6"), ("gsrsearch", query.as_str()), ("gsrlimit", "24"), ("gsroffset", &offset.to_string()), ("prop", "imageinfo"), ("iiprop", "url|extmetadata"), ("iiurlwidth", "480")
    ]).send().await.map_err(network_error)?;
    let bytes = read_body(response).await?;
    parse_media(serde_json::from_slice(&bytes).map_err(|_| unavailable())?)
}

pub async fn perform(client: Client, request: SearchRequest) -> Result<SearchResponse, ApiError> {
    validate(&request)?;
    let started = Instant::now();
    let mut response = if matches!(request.category, Category::Images | Category::Photos) {
        search_media(&client, &request).await?
    } else if request.cursor.is_some() {
        search_web(&client, &request).await?
    } else {
        match search_feed(&client, &request).await {
            Ok(response) => response,
            Err(_) => search_web(&client, &request).await.map_err(|_| unavailable())?,
        }
    };
    if request.category == Category::Videos {
        response.results.retain_mut(video_result);
        response.notice = Some("Video pages from the web. Open a result to watch on its original site.".into());
    } else if request.category == Category::Web && request.cursor.is_none() {
        response.overview = response.results.iter().filter(|item| !item.content.is_empty()).take(3).cloned().map(|mut item| { item.content = item.content.chars().take(260).collect(); item }).collect();
    }
    response.elapsed = started.elapsed().as_secs_f64();
    Ok(response)
}

struct CachedSearch {
    key: String,
    created: Instant,
    response: SearchResponse,
}

pub struct Engine {
    client: Client,
    cache: Mutex<VecDeque<CachedSearch>>,
}

impl Engine {
    pub fn new() -> Result<Self, reqwest::Error> { Ok(Self { client: client()?, cache: Mutex::new(VecDeque::new()) }) }

    pub async fn search(&self, mut request: SearchRequest) -> Result<SearchResponse, ApiError> {
        request.q = request.q.trim().to_owned();
        validate(&request)?;
        let key = serde_json::to_string(&request).map_err(|_| unavailable())?;
        if let Ok(cache) = self.cache.lock() {
            if let Some(entry) = cache.iter().find(|entry| entry.key == key && entry.created.elapsed() < Duration::from_secs(120)) {
                let mut response = entry.response.clone();
                response.cached = true;
                response.elapsed = 0.0;
                return Ok(response);
            }
        }
        let response = perform(self.client.clone(), request).await?;
        if let Ok(mut cache) = self.cache.lock() {
            cache.retain(|entry| entry.created.elapsed() < Duration::from_secs(120) && entry.key != key);
            while cache.len() >= 32 { cache.pop_front(); }
            cache.push_back(CachedSearch { key, created: Instant::now(), response: response.clone() });
        }
        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn request(q: &str) -> SearchRequest { SearchRequest { q: q.into(), category: Category::Web, cursor: None } }

    #[test]
    fn simple_query_and_category_contract() {
        let input: SearchRequest = serde_json::from_value(json!({"q":"YouTube"})).unwrap();
        assert_eq!(input.category, Category::Web);
        assert!(validate(&input).is_ok());
        assert!(serde_json::from_value::<SearchRequest>(json!({"q":"hello", "endpoint":"https://example.com"})).is_err());
    }

    #[test]
    fn rejects_unsafe_urls() {
        for value in ["file:///etc/passwd", "javascript:alert(1)", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://192.168.1.1", "https://user:secret@example.com", "https://device.local"] { assert!(web_url(value).is_none()); }
        assert!(web_url("https://www.youtube.com/").is_some());
    }

    #[test]
    fn feed_returns_original_web_destinations_not_encyclopedia_substitutes() {
        let xml = "<rss><channel><item><title>YouTube</title><link>https://www.youtube.com/</link><description>Watch &amp; share videos</description></item><item><title>Duplicate</title><link>https://www.youtube.com/</link></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>";
        let response = parse_feed(xml).unwrap();
        assert_eq!(response.results.len(), 1);
        assert_eq!(response.results[0].url, "https://www.youtube.com/");
        assert_eq!(response.results[0].content, "Watch & share videos");
        assert!(parse_feed("<html>Challenge</html>").is_err());
    }

    #[test]
    fn xml_dtd_is_rejected() { assert!(parse_feed("<!DOCTYPE rss [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]><rss>&secret;</rss>").is_err()); }

    #[test]
    fn web_parser_unwraps_links_and_rejects_challenges() {
        let html = r#"<div class="web-result result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fyoutube.com%2F">YouTube</a><a class="result__snippet">Watch videos</a></div>"#;
        assert_eq!(parse_web(html).unwrap().results[0].url, "https://youtube.com/");
        assert!(parse_web(r#"<form id="challenge-form"></form>"#).is_err());
        assert!(parse_web("<h1>Unexpected markup</h1>").is_err());
    }

    #[test]
    fn media_results_retain_credit_and_safe_thumbnails() {
        let data = json!({"batchcomplete":true,"query":{"pages":[{"title":"File:Forest.jpg","index":1,"imageinfo":[{"descriptionurl":"https://commons.wikimedia.org/wiki/File:Forest.jpg","thumburl":"https://thumb.wikimedia.org/forest.jpg?utm_source=test","extmetadata":{"Artist":{"value":"A photographer"},"LicenseShortName":{"value":"CC BY-SA"}}}]}]},"continue":{"gsroffset":24}});
        let response = parse_media(data).unwrap();
        assert_eq!(response.results[0].credit.as_deref(), Some("A photographer · CC BY-SA"));
        assert!(matches!(response.next_cursor, Some(SearchCursor::Media { offset: 24 })));
        assert_eq!(response.results[0].thumbnail.as_deref(), Some("https://thumb.wikimedia.org/forest.jpg"));
    }

    #[test]
    fn malformed_queries_and_mismatched_cursors_are_rejected() {
        assert!(validate(&request(" ")).is_err());
        assert!(validate(&request(&"x".repeat(501))).is_err());
        let mut input = request("ok");
        input.cursor = Some(SearchCursor::Media { offset: 2 });
        assert!(validate(&input).is_err());
    }

    #[test]
    fn youtube_video_previews_require_real_video_ids() {
        let mut result = SearchResult { title:"Video".into(), url:"https://www.youtube.com/watch?v=abcdefghijk".into(), content:String::new(), thumbnail:None, credit:None };
        assert!(video_result(&mut result));
        assert_eq!(result.thumbnail.unwrap(), "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
    }
}
