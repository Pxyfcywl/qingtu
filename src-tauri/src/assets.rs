use crate::store::{err, Result, Store};
use rusqlite::params;
use serde_json::{json,Value};
use sha2::{Digest,Sha256};
use std::{fs, io::{Read,Write}, path::Path};

pub fn hash_file(path:&Path)->Result<String> {
    let mut f=fs::File::open(path).map_err(err)?;
    let mut hash=Sha256::new(); let mut buffer=[0u8;65536];
    loop { let n=f.read(&mut buffer).map_err(err)?; if n==0 { break; } hash.update(&buffer[..n]); }
    Ok(hex::encode(hash.finalize()))
}
pub fn thumbnail_bytes(image:&image::DynamicImage)->Result<Vec<u8>> {
    use image::{ImageEncoder,codecs::png::{PngEncoder,CompressionType,FilterType}};
    let mut edge=512u32;
    loop {
        let rgba=image.thumbnail(edge,edge).to_rgba8();let mut bytes=Vec::new();
        PngEncoder::new_with_quality(&mut bytes,CompressionType::Best,FilterType::Adaptive)
            .write_image(rgba.as_raw(),rgba.width(),rgba.height(),image::ExtendedColorType::Rgba8).map_err(err)?;
        if bytes.len()<=200*1024{return Ok(bytes);}
        if edge<=64{return Err("无法在缩略图大小限制内编码".into());}
        edge=((edge as f64*(200.0*1024.0/bytes.len() as f64).sqrt()*0.9) as u32).clamp(64,edge-1);
    }
}
pub fn validate_asset(asset:&Value)->Result<()> {
    let id=asset["id"].as_str().ok_or("缺少素材 ID")?;
    if id.len()!=64||!id.bytes().all(|b|b.is_ascii_hexdigit()&&!b.is_ascii_uppercase())||asset["sha256"].as_str()!=Some(id) {return Err("素材标识无效".into());}
    let extension=match asset["mime"].as_str(){Some("image/png")=>"png",Some("image/jpeg")=>"jpg",Some("image/webp")=>"webp",Some("video/mp4")=>"mp4",_=>return Err("素材格式不受支持".into())};
    if asset["relativePath"].as_str()!=Some(format!("assets/{id}.{extension}").as_str()){return Err("素材路径不符合哈希目录约定".into());}
    if let Some(thumb)=asset["thumbnailPath"].as_str(){if thumb!=format!("thumbs/{id}.png"){return Err("缩略图路径无效".into());}}
    let max=if extension=="mp4"{100*1024*1024}else{10*1024*1024};
    if asset["byteSize"].as_u64().filter(|size|*size>0&&*size<=max).is_none(){return Err("素材大小超限".into());}
    if extension!="mp4" {
        let w=asset["width"].as_u64().ok_or("图片宽度无效")?;let h=asset["height"].as_u64().ok_or("图片高度无效")?;
        if w==0||h==0||w.saturating_mul(h)>20_000_000{return Err("图片尺寸超限".into());}
    }
    Ok(())
}
impl Store {
    pub fn import_video_bytes(&self,bytes:&[u8],name:&str)->Result<Value> {
        if bytes.is_empty()||bytes.len()>100*1024*1024{return Err("视频为空或超过 100 MiB".into());}
        if bytes.len()<12||&bytes[4..8]!=b"ftyp"{return Err("视频不是有效的 MP4 文件".into());}
        let path=self.root()?.join("assets").join(format!(".clipboard-{}.mp4",uuid::Uuid::new_v4()));
        crate::store::atomic_write(&path,bytes)?;
        let result=(||{let mut asset=self.import_asset(&path)?;asset["name"]=json!(if name.trim().is_empty(){"粘贴视频.mp4"}else{name});
            self.db()?.execute("UPDATE assets SET data=?2 WHERE id=?1",params![asset["id"].as_str(),asset.to_string()]).map_err(err)?;Ok(asset)})();
        let _=fs::remove_file(&path);result
    }
    pub fn import_image_bytes(&self,bytes:&[u8],name:&str)->Result<Value> {
        if bytes.is_empty()||bytes.len()>10*1024*1024{return Err("图片为空或超过 10 MiB".into());}
        let extension=match image::guess_format(bytes).map_err(err)? {
            image::ImageFormat::Png=>"png",image::ImageFormat::Jpeg=>"jpg",image::ImageFormat::WebP=>"webp",
            _=>return Err("粘贴图片支持 PNG、JPEG、WebP 格式".into()),
        };
        let reader=image::ImageReader::new(std::io::Cursor::new(bytes)).with_guessed_format().map_err(err)?;
        let (width,height)=reader.into_dimensions().map_err(err)?;
        if width==0||height==0||u64::from(width)*u64::from(height)>20_000_000{return Err("图片不能超过 2000 万像素".into());}
        let path=self.root()?.join("assets").join(format!(".clipboard-{}.{}",uuid::Uuid::new_v4(),extension));
        crate::store::atomic_write(&path,bytes)?;
        let result=(||{
            let mut asset=self.import_asset(&path)?;
            asset["name"]=json!(if name.trim().is_empty(){"粘贴图片"}else{name});
            self.db()?.execute("UPDATE assets SET data=?2 WHERE id=?1",params![asset["id"].as_str(),asset.to_string()]).map_err(err)?;
            Ok(asset)
        })();
        let _=fs::remove_file(&path);result
    }
    pub fn import_asset(&self,path:&Path)->Result<Value> {
        if !path.is_file() { return Err("素材文件不存在".into()); }
        let bytes=fs::metadata(path).map_err(err)?.len();
        let ext=path.extension().and_then(|s|s.to_str()).unwrap_or("").to_lowercase();
        let mime=match ext.as_str() { "png"=>"image/png","jpg"|"jpeg"=>"image/jpeg","webp"=>"image/webp","mp4"=>"video/mp4",_=>return Err("支持 PNG、JPEG、WebP 图片和 MP4 视频".into()) };
        let video=mime.starts_with("video/");
        if bytes==0 || bytes>if video {100*1024*1024} else {10*1024*1024} { return Err("文件为空或超过大小限制".into()); }
        let (width,height)=if video {
            let mut f=fs::File::open(path).map_err(err)?; let mut header=[0;12]; f.read_exact(&mut header).map_err(err)?;
            if &header[4..8]!=b"ftyp" { return Err("不是有效的 MP4 文件".into()); } (0,0)
        } else {
            let reader=image::ImageReader::open(path).map_err(err)?.with_guessed_format().map_err(err)?;
            let (w,h)=reader.into_dimensions().map_err(|e|format!("图片损坏：{e}"))?;
            if u64::from(w)*u64::from(h)>20_000_000 { return Err("图片不能超过 2000 万像素".into()); } (w,h)
        };
        let root=self.root()?;
        let temporary=root.join("assets").join(format!(".{}.tmp",uuid::Uuid::new_v4()));
        let mut source=fs::File::open(path).map_err(err)?;
        let mut target=fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(err)?;
        let mut hasher=Sha256::new(); let mut buffer=[0u8;65536]; let mut copied=0;
        loop { let n=source.read(&mut buffer).map_err(err)?; if n==0 {break;} copied+=n as u64;
            if copied>bytes { let _=fs::remove_file(&temporary); return Err("导入时文件发生变化".into()); }
            hasher.update(&buffer[..n]); target.write_all(&buffer[..n]).map_err(err)?; crate::store::checkpoint("asset_copy_chunk"); }
        target.sync_all().map_err(err)?; drop(target);
        if copied!=bytes {let _=fs::remove_file(&temporary);return Err("素材在导入期间被修改，请重试".into());}
        let hash=hex::encode(hasher.finalize());
        let extension=if video {"mp4"} else {match mime {"image/jpeg"=>"jpg","image/webp"=>"webp",_=>"png"}};
        let relative=format!("assets/{hash}.{extension}"); let final_path=root.join(&relative);
        crate::store::checkpoint("asset_before_publish");
        if final_path.exists() { if hash_file(&final_path)?!=hash{return Err("已有素材文件损坏，请先备份并恢复".into());}fs::remove_file(&temporary).map_err(err)?; }
        else { crate::store::publish_file(&temporary,&final_path)?; }
        crate::store::checkpoint("asset_after_publish");
        let thumb=if !video {
            let relative=format!("thumbs/{hash}.png");
            let destination=root.join(&relative);
            if !destination.exists()||fs::metadata(&destination).map_err(err)?.len()>200*1024 {
                crate::store::atomic_write(&destination,&thumbnail_bytes(&image::open(&final_path).map_err(err)?)?)?;
            }
            Some(relative)
        } else { None };
        let asset=json!({"id":hash,"sha256":hash,"mime":mime,"byteSize":copied,"width":width,"height":height,
            "relativePath":relative,"thumbnailPath":thumb,"name":path.file_name().unwrap_or_default().to_string_lossy()});
        self.db()?.execute("INSERT INTO assets VALUES(?1,?2) ON CONFLICT(id) DO NOTHING",params![hash,asset.to_string()]).map_err(err)?;
        crate::store::checkpoint("asset_after_commit");
        Ok(asset)
    }
    pub fn set_asset_metadata(&self,id:&str,metadata:Value)->Result<Value> {
        let data:String=self.db()?.query_row("SELECT data FROM assets WHERE id=?1",[id],|r|r.get(0)).map_err(err)?;
        let mut asset:Value=serde_json::from_str(&data).map_err(err)?;
        for key in ["width","height","duration"] { if metadata[key].is_number() {asset[key]=metadata[key].clone();} }
        if let Some(values)=metadata["posterBytes"].as_array() {
            if values.len()>1024*1024{return Err("视频封面过大".into());}
            let bytes:Vec<u8>=values.iter().map(|v|v.as_u64().filter(|b|*b<=255).map(|b|b as u8).ok_or_else(||"视频封面无效".to_string())).collect::<Result<_>>()?;
            let reader=image::ImageReader::new(std::io::Cursor::new(&bytes)).with_guessed_format().map_err(err)?;
            let (w,h)=reader.into_dimensions().map_err(err)?;
            if w>512||h>512||w==0||h==0{return Err("封面尺寸超过 512 像素".into());}
            let relative=format!("thumbs/{id}.png");
            let decoded=image::load_from_memory(&bytes).map_err(err)?;
            crate::store::atomic_write(&self.root()?.join(&relative),&thumbnail_bytes(&decoded)?)?;
            asset["thumbnailPath"]=json!(relative);
        }
        self.db()?.execute("UPDATE assets SET data=?2 WHERE id=?1",params![id,asset.to_string()]).map_err(err)?;
        Ok(asset)
    }
}
