use std::path::PathBuf;
use crate::store::{err,Result};

pub fn validate(bytes:&[u8])->Result<()> {
    if bytes.len()>100*1024*1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {return Err("PNG 数据无效或过大".into());}
    Ok(())
}

// ASCII metadata preserves Chinese, spaces and non-BMP characters in IPC headers.
pub fn destination(encoded:&str)->Result<PathBuf> {
    let path=String::from_utf8(hex::decode(encoded).map_err(err)?).map_err(err)?;
    if path.is_empty()||path.contains('\0') {return Err("PNG 保存路径无效".into());}
    let path=PathBuf::from(path);
    if !path.is_absolute() {return Err("请选择完整的 PNG 保存路径".into());}
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn destination_preserves_unicode_and_rejects_invalid_metadata(){
        let path=std::env::temp_dir().join("轻图 导出 😀.png");
        assert_eq!(destination(&hex::encode(path.to_string_lossy().as_bytes())).unwrap(),path);
        for encoded in ["","invalid","ff","0061","72656c61746976652e706e67"] {assert!(destination(encoded).is_err());}
    }
    #[test]
    fn payload_requires_png_signature(){
        assert!(validate(include_bytes!("../../public/demo/triangle.png")).is_ok());
        for bytes in [b"not a PNG".as_slice(),b"\x89PNG".as_slice(),b"".as_slice()] {assert!(validate(bytes).is_err());}
    }
}
