package com.example.com.englishai.backend.infrastructure.profile;

import org.junit.jupiter.api.Test;
import java.nio.file.Files;
import static org.assertj.core.api.Assertions.assertThat;

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
}
