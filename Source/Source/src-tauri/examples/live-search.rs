use sreon_core::search::{client, perform, SearchRequest, Category};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let q = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    let query = if q.is_empty() { "rust programming language".to_owned() } else { q };
    match perform(client().expect("HTTPS client"), SearchRequest { q: query, category: Category::Web, cursor: None }).await {
        Ok(response) if !response.results.is_empty() => println!("{}", serde_json::to_string_pretty(&response).unwrap()),
        Ok(_) => { eprintln!("Live source returned no results."); std::process::exit(1); }
        Err(error) => { eprintln!("{}", error.message); std::process::exit(1); }
    }
}
