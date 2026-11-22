use rusty_leveldb::{LdbIterator, Options, DB};
use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path};

const KEY_PREFIX: &[u8] = b"_file://\0\x01ktoya.";

fn decode(bytes: &[u8]) -> Option<String> {
    match bytes.split_first()? {
        (1, raw) => Some(raw.iter().map(|&byte| char::from(byte)).collect()),
        (0, raw) if raw.len() % 2 == 0 => {
            let utf16: Vec<_> = raw
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect();
            String::from_utf16(&utf16).ok()
        }
        _ => None,
    }
}

fn saved_key(key: &str) -> bool {
    matches!(
        key,
        "profile" | "settings" | "lastRoom" | "seenVersion" | "playSide" | "server"
    ) || key.strip_prefix("notes.").is_some_and(|code| {
        code.len() == 6 && code.bytes().all(|byte| byte.is_ascii_digit())
    })
}

pub fn read(storage: &Path) -> Result<BTreeMap<String, String>, String> {
    let mut values = BTreeMap::new();
    match fs::metadata(storage.join("CURRENT")) {
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(values),
        Err(error) => return Err(error.to_string()),
    }

    // LevelDB replays its journal on open. Let it write only to a temporary copy.
    let copy = tempfile::tempdir().map_err(|error| error.to_string())?;
    for entry in fs::read_dir(storage).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.file_type().map_err(|error| error.to_string())?.is_file()
            && entry.file_name() != "LOCK"
        {
            fs::copy(entry.path(), copy.path().join(entry.file_name()))
                .map_err(|error| error.to_string())?;
        }
    }
    let options = Options {
        create_if_missing: false,
        paranoid_checks: true,
        ..Default::default()
    };
    let mut db = DB::open(copy.path(), options).map_err(|error| error.to_string())?;
    let mut entries = db.new_iter().map_err(|error| error.to_string())?;
    entries.seek(KEY_PREFIX);
    while let Some((key, raw)) = entries.current() {
        let Some(suffix) = key.strip_prefix(KEY_PREFIX) else {
            break;
        };
        if let Ok(key) = std::str::from_utf8(suffix) {
            if saved_key(key) {
                if let Some(value) = decode(&raw) {
                    if key == "server" || serde_json::from_str::<serde_json::Value>(&value).is_ok() {
                        values.insert(format!("ktoya.{key}"), value);
                    }
                }
            }
        }
        entries.advance();
    }
    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_electron_identity_and_cyrillic_notes_from_the_file_origin() {
        let dir = tempfile::tempdir().unwrap();
        let mut db = DB::open(dir.path(), Options::default()).unwrap();
        db.put(b"_file://\0\x01ktoya.profile", b"\x01{\"id\":\"original\"}")
            .unwrap();
        let note = "{\"text\":\"Я живой\"}";
        let raw: Vec<_> = std::iter::once(0)
            .chain(note.encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        db.put(b"_file://\0\x01ktoya.notes.123456", &raw).unwrap();
        db.put(b"_https://example.com\0\x01ktoya.notes.654321", &raw)
            .unwrap();
        db.put(b"_file://\0\x01ktoya.seenVersion", b"\x01broken").unwrap();
        db.flush().unwrap();
        drop(db);

        assert_eq!(
            read(dir.path()).unwrap(),
            BTreeMap::from([
                ("ktoya.notes.123456".into(), note.into()),
                ("ktoya.profile".into(), "{\"id\":\"original\"}".into()),
            ])
        );
    }

    #[test]
    fn starts_with_empty_storage_on_a_fresh_install() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(&dir.path().join("missing")).unwrap().is_empty());
    }
}
