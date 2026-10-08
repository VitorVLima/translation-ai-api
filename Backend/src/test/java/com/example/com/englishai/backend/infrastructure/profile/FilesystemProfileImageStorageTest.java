package com.example.com.englishai.backend.infrastructure.profile;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.NoSuchElementException;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FilesystemProfileImageStorageTest {
    @Test void storesReadsAndDeletesManagedAsset() throws Exception {
        var dir=Files.createTempDirectory("englishai-avatar-test");
        try {
            var storage=new FilesystemProfileImageStorage(dir.toString());
            var key=storage.store(new byte[]{1,2,3},"image/png");
            assertThat(storage.read(key)).containsExactly(1,2,3);
            storage.delete(key);
            assertThat(Files.exists(dir.resolve(key))).isFalse();
        } finally { Files.walk(dir).sorted(java.util.Comparator.reverseOrder()).forEach(path->{try{Files.deleteIfExists(path);}catch(Exception ignored){}}); }
    }

    @Test void ignoresTraversalOnDelete() throws Exception {
        var dir=Files.createTempDirectory("englishai-avatar-test");
        try { new FilesystemProfileImageStorage(dir.toString()).delete("../outside.png"); assertThat(Files.exists(dir)).isTrue(); } finally { Files.deleteIfExists(dir); }
    }

    @Test void survivesReopeningAndNeverUsesClientFilenames(@TempDir Path dir) throws Exception {
        var first = new FilesystemProfileImageStorage(dir.toString());
        var bytes = new byte[]{1, 2, 3};
        var key = first.store(bytes, "image/png");
        assertThat(key).matches("[0-9a-f-]{36}\\.png");
        assertThat(new FilesystemProfileImageStorage(dir.toString()).read(key)).containsExactly(bytes);
        assertThatThrownBy(() -> first.store(new byte[5 * 1024 * 1024 + 1], "image/png"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> first.store(bytes, "image/svg+xml"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> first.read("../outside.png"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> first.read("C:\\outside.png"))
                .isInstanceOf(IllegalArgumentException.class);
        first.delete("../outside.png");
        first.delete(key);
        assertThatThrownBy(() -> first.read(key)).isInstanceOf(NoSuchElementException.class);
    }

    @Test void productionRequiresAnExistingWritableAbsoluteDirectory(@TempDir Path dir) {
        var prod = new MockEnvironment();
        prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> new FilesystemProfileImageStorage("./data/profile-images", prod))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new FilesystemProfileImageStorage(dir.resolve("missing").toString(), prod))
                .isInstanceOf(IllegalStateException.class);
        assertThat(new FilesystemProfileImageStorage(dir.toString(), prod)).isNotNull();
    }

    @Test void refusesSymlinksAndOversizedStoredFiles(@TempDir Path dir) throws Exception {
        var storage = new FilesystemProfileImageStorage(dir.toString());
        var key = storage.store(new byte[]{1}, "image/png");
        Files.write(dir.resolve(key), new byte[5 * 1024 * 1024 + 1]);
        assertThatThrownBy(() -> storage.read(key)).isInstanceOf(NoSuchElementException.class);
        Files.delete(dir.resolve(key));
        try {
            Files.createSymbolicLink(dir.resolve(key), dir.resolve("outside.png"));
            assertThatThrownBy(() -> storage.read(key)).isInstanceOf(NoSuchElementException.class);
        } catch (UnsupportedOperationException | java.nio.file.FileSystemException ignored) {
            // Some Windows hosts do not permit creating symlinks in an unprivileged test.
        }
    }
}
