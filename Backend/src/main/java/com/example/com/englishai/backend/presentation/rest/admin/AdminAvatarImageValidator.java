package com.example.com.englishai.backend.presentation.rest.admin;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Locale;

/** Decodes uploads with bounded dimensions and stores fresh pixels without source metadata. */
final class AdminAvatarImageValidator {
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final int MAX_DIMENSION = 4096;
    private static final long MAX_PIXELS = 16_000_000L;

    private AdminAvatarImageValidator() {}

    static ValidatedImage validate(byte[] bytes, String declaredType) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw invalid();
        }
        String expected = switch (declaredType == null ? "" : declaredType.toLowerCase(Locale.ROOT)) {
            case "image/jpeg" -> "jpeg";
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            default -> throw invalid();
        };
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw invalid();
            ImageReader reader = readers.next();
            try {
                if (!expected.equalsIgnoreCase(reader.getFormatName())) throw invalid();
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION
                        || (long) width * height > MAX_PIXELS) throw invalid();
                BufferedImage image = reader.read(0);
                if (image == null || image.getWidth() != width || image.getHeight() != height) throw invalid();
                // WebP has a reader but no writer in the selected plugin; PNG preserves transparency.
                String outputFormat = expected.equals("jpeg") ? "jpeg" : "png";
                String outputType = expected.equals("jpeg") ? "image/jpeg" : "image/png";
                var clean = new ByteArrayOutputStream();
                if (!ImageIO.write(image, outputFormat, clean) || clean.size() > MAX_BYTES) throw invalid();
                return new ValidatedImage(clean.toByteArray(), outputType);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException ex) {
            throw invalid();
        }
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Invalid avatar image");
    }

    record ValidatedImage(byte[] bytes, String contentType) {}
}
