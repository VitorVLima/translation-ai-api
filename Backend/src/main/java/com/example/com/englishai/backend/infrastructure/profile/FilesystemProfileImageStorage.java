package com.example.com.englishai.backend.infrastructure.profile;

import com.example.com.englishai.backend.application.profile.ProfileImageStorage;
import java.io.IOException;
import java.nio.channels.Channels;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.stereotype.Component;

@Component
public class FilesystemProfileImageStorage implements ProfileImageStorage {
    private static final int MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    private final Path root;

    @Autowired
    public FilesystemProfileImageStorage(@Value("${profile.image-storage-dir:./data/profile-images}") String directory,
                                         Environment environment) {
        if (directory == null || directory.isBlank()) throw new IllegalArgumentException("Avatar storage directory is required");
        Path configured = Path.of(directory);
        if (environment.acceptsProfiles(Profiles.of("prod", "production"))) {
            if (!configured.isAbsolute() || !Files.isDirectory(configured) || !Files.isWritable(configured)) {
                throw new IllegalStateException("Production avatar storage requires an existing writable absolute directory");
            }
        }
        root = configured.toAbsolutePath().normalize();
    }

    public FilesystemProfileImageStorage(String directory) {
        this(directory, new StandardEnvironment());
    }

    @Override
    public String store(byte[] bytes, String contentType) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES || contentType == null) {
            throw new IllegalArgumentException("Invalid avatar image");
        }
        String extension = switch (contentType.toLowerCase(Locale.ROOT)) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> throw new IllegalArgumentException("Unsupported image format");
        };
        String key = UUID.randomUUID() + extension;
        try {
            Files.createDirectories(root);
            Files.write(root.resolve(key), bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            return key;
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to store avatar image", exception);
        }
    }

    @Override
    public void delete(String key) {
        if (!validKey(key)) return;
        try {
            Files.deleteIfExists(root.resolve(key));
        } catch (IOException ignored) {
            // Replacing an image remains valid if best-effort old-file cleanup fails.
        }
    }

    @Override
    public byte[] read(String key) {
        if (!validKey(key)) throw new IllegalArgumentException("Invalid image");
        Path image = root.resolve(key);
        try {
            if (!Files.isRegularFile(image, LinkOption.NOFOLLOW_LINKS)) throw new NoSuchElementException("Image not found");
            try (var channel = Files.newByteChannel(image, Set.of(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS));
                 var input = Channels.newInputStream(channel)) {
                byte[] bytes = input.readNBytes(MAX_IMAGE_BYTES + 1);
                if (bytes.length > MAX_IMAGE_BYTES) throw new NoSuchElementException("Image not found");
                return bytes;
            }
        } catch (IOException exception) {
            throw new NoSuchElementException("Image not found");
        }
    }

    private static boolean validKey(String key) {
        return key != null && key.matches("(?i)[A-Za-z0-9_-]{1,128}\\.(?:jpg|jpeg|png|webp)");
    }
}
