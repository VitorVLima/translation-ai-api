package com.example.com.englishai.backend.application.conversation;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;

/** Single-flight within one JVM; persistence locks remain authoritative across instances. */
public final class LocalOperationLocks {
    private final ConcurrentHashMap<UUID, Entry> entries = new ConcurrentHashMap<>();
    private static final class Entry {
        final ReentrantLock lock = new ReentrantLock();
        int users;
    }
    public <T> T run(UUID id, Supplier<T> work) {
        Entry entry = entries.compute(id, (ignored, current) -> {
            if (current == null) current = new Entry();
            current.users++;
            return current;
        });
        entry.lock.lock();
        try { return work.get(); }
        finally {
            entry.lock.unlock();
            entries.compute(id, (ignored, current) -> {
                if (current != entry) throw new IllegalStateException("Operation lock changed");
                return --current.users == 0 ? null : current;
            });
        }
    }
}
