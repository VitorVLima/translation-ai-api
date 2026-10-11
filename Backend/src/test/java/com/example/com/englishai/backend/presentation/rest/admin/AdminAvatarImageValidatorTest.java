package com.example.com.englishai.backend.presentation.rest.admin;

import org.junit.jupiter.api.Test;

import javax.imageio.ImageIO;
import javax.imageio.IIOImage;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AdminAvatarImageValidatorTest {
    @Test void webpDecoderIsAvailableForAcceptedUploadFormat() throws Exception {
        assertThat(ImageIO.getImageReadersByFormatName("webp").hasNext()).isTrue();
    }

    @Test void realWebpIsDecodedAndNormalizedToPng() throws Exception {
        byte[] webp = Base64.getDecoder().decode(
                "UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoCAAIAAUAmJaACdLoAA5gA/vW4f/wG6+LaZf/gTv/gTv/AAAAA");
        var validated = AdminAvatarImageValidator.validate(webp, "image/webp");
        assertThat(validated.contentType()).isEqualTo("image/png");
        assertThat(ImageIO.read(new java.io.ByteArrayInputStream(validated.bytes()))).isNotNull();
    }

    @Test void validPngIsDecodedAndReencoded() throws Exception {
        byte[] source = image("png");
        var validated = AdminAvatarImageValidator.validate(source, "image/png");
        assertThat(validated.contentType()).isEqualTo("image/png");
        assertThat(ImageIO.read(new java.io.ByteArrayInputStream(validated.bytes())).getWidth()).isEqualTo(2);
    }

    @Test void validJpegKeepsItsPublicFormat() throws Exception {
        var validated = AdminAvatarImageValidator.validate(image("jpeg"), "image/jpeg");
        assertThat(validated.contentType()).isEqualTo("image/jpeg");
        assertThat(ImageIO.read(new java.io.ByteArrayInputStream(validated.bytes()))).isNotNull();
    }

    @Test void mismatchedOrTruncatedImagesAreRejected() throws Exception {
        assertThatThrownBy(() -> AdminAvatarImageValidator.validate(image("png"), "image/jpeg"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AdminAvatarImageValidator.validate(new byte[]{(byte) 137, 80, 78, 71}, "image/png"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void oversizedDimensionsAreRejectedBeforePixelDecode() throws Exception {
        byte[] source = image("png");
        // PNG IHDR width occupies bytes 16..19. The decoder must reject before reading pixels.
        source[16] = 0;
        source[17] = 0;
        source[18] = 0x20;
        source[19] = 0;
        assertThatThrownBy(() -> AdminAvatarImageValidator.validate(source, "image/png"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void pngMetadataIsRemovedWhenReencoded() throws Exception {
        byte[] source = pngWithText("synthetic-private-metadata");
        var validated = AdminAvatarImageValidator.validate(source, "image/png");
        assertThat(new String(validated.bytes(), StandardCharsets.ISO_8859_1))
                .doesNotContain("synthetic-private-metadata");
        assertThat(ImageIO.read(new java.io.ByteArrayInputStream(validated.bytes()))).isNotNull();
    }

    private static byte[] image(String format) throws Exception {
        var output = new ByteArrayOutputStream();
        var pixels = new BufferedImage(2, 2, format.equals("jpeg") ? BufferedImage.TYPE_INT_RGB : BufferedImage.TYPE_INT_ARGB);
        assertThat(ImageIO.write(pixels, format, output)).isTrue();
        return output.toByteArray();
    }

    private static byte[] pngWithText(String value) throws Exception {
        var writer = ImageIO.getImageWritersByFormatName("png").next();
        var output = new ByteArrayOutputStream();
        var image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
        try (var stream = new MemoryCacheImageOutputStream(output)) {
            writer.setOutput(stream);
            var metadata = writer.getDefaultImageMetadata(ImageTypeSpecifier.createFromRenderedImage(image), null);
            var root = (IIOMetadataNode) metadata.getAsTree("javax_imageio_png_1.0");
            var text = new IIOMetadataNode("tEXt");
            var entry = new IIOMetadataNode("tEXtEntry");
            entry.setAttribute("keyword", "Comment");
            entry.setAttribute("value", value);
            text.appendChild(entry);
            root.appendChild(text);
            metadata.setFromTree("javax_imageio_png_1.0", root);
            writer.write(null, new IIOImage(image, null, metadata), writer.getDefaultWriteParam());
        } finally {
            writer.dispose();
        }
        return output.toByteArray();
    }
}
