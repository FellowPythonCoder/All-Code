use sreon_core::search::{ApiError, Engine, SearchRequest};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, Read, Write};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    id: Value,
    method: String,
    params: SearchRequest,
}

async fn respond(engine: &Engine, line: &[u8]) -> Value {
    let request: Request = match serde_json::from_slice(line) {
        Ok(value) => value,
        Err(_) => return json!({"version":1,"id":null,"error":ApiError::new(400,"INVALID_REQUEST","Send a JSON object with id, method, and params.")}),
    };
    if request.method != "search" { return json!({"version":1,"id":request.id,"error":ApiError::new(400,"UNKNOWN_METHOD","Supported method: search.")}); }
    match engine.search(request.params).await {
        Ok(result) => json!({"version":1,"id":request.id,"result":result}),
        Err(error) => json!({"version":1,"id":request.id,"error":error}),
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let engine = Engine::new()?;
    let stdin = io::stdin();
    let mut input = stdin.lock();
    let stdout = io::stdout();
    let mut output = stdout.lock();
    loop {
        let mut line = Vec::new();
        let read = (&mut input).take(16385).read_until(b'\n', &mut line)?;
        if read == 0 { break; }
        let response = if line.len() > 16384 {
            if !line.ends_with(b"\n") {
                loop {
                    let chunk = input.fill_buf()?;
                    let length = chunk.iter().position(|byte| *byte == b'\n').map(|index| index + 1).unwrap_or(chunk.len());
                    let done = chunk.is_empty() || chunk.get(length.saturating_sub(1)) == Some(&b'\n');
                    input.consume(length);
                    if done { break; }
                }
            }
            json!({"version":1,"id":null,"error":ApiError::new(413,"REQUEST_TOO_LARGE","Requests must not exceed 16 KiB.")})
        } else { respond(&engine, &line).await };
        serde_json::to_writer(&mut output, &response)?;
        writeln!(output)?;
        output.flush()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn invalid_requests_never_make_network_calls() {
        let engine = Engine::new().unwrap();
        assert_eq!(respond(&engine, b"not json").await["error"]["code"], "INVALID_REQUEST");
        let response = respond(&engine, br#"{"id":7,"method":"search","params":{"q":""}}"#).await;
        assert_eq!(response["id"], 7);
        assert_eq!(response["error"]["code"], "INVALID_QUERY");
        assert_eq!(respond(&engine, br#"{"id":1,"method":"execute","params":{"q":"test"}}"#).await["error"]["code"], "UNKNOWN_METHOD");
    }
}
