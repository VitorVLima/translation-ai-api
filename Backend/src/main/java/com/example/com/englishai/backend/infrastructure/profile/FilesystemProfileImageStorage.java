package com.example.com.englishai.backend.infrastructure.profile;
import com.example.com.englishai.backend.application.profile.ProfileImageStorage; import org.springframework.beans.factory.annotation.Value; import org.springframework.stereotype.Component; import java.io.*; import java.nio.file.*; import java.util.*;
@Component public class FilesystemProfileImageStorage implements ProfileImageStorage {
 private final Path root; public FilesystemProfileImageStorage(@Value("${profile.image-storage-dir:./data/profile-images}") String dir){root=Path.of(dir).toAbsolutePath().normalize();}
 public String store(byte[] bytes,String contentType){String ext=switch(contentType.toLowerCase(Locale.ROOT)){case "image/jpeg"->".jpg";case "image/png"->".png";case "image/webp"->".webp";default->throw new IllegalArgumentException("Unsupported image format");};String key=UUID.randomUUID()+ext;try{Files.createDirectories(root);Files.write(root.resolve(key),bytes,StandardOpenOption.CREATE_NEW);return key;}catch(IOException e){throw new IllegalStateException("Unable to store profile image",e);}}
 public void delete(String key){if(key==null||key.contains("..")||key.contains("/")||key.contains("\\"))return;try{Files.deleteIfExists(root.resolve(key).normalize());}catch(IOException ignored){}}
 public byte[] read(String key){if(key==null||key.contains("..")||key.contains("/")||key.contains("\\"))throw new IllegalArgumentException("Invalid image");try{return Files.readAllBytes(root.resolve(key).normalize());}catch(IOException e){throw new NoSuchElementException("Image not found");}}
}
