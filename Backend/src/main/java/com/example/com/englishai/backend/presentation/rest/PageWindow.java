package com.example.com.englishai.backend.presentation.rest;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/** Optional paging for existing array responses. An absent page preserves API v1 behavior. */
public final class PageWindow {
    private PageWindow() {}

    public static Pageable optional(Integer page, Integer size, int defaultSize) {
        if (page == null) {
            if (size != null) throw new IllegalArgumentException("Page is required when size is provided");
            return Pageable.unpaged();
        }
        int effectiveSize = size == null ? defaultSize : size;
        if (page < 0 || effectiveSize < 1 || effectiveSize > 100
                || (long) page * effectiveSize > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("Invalid page or size");
        }
        return PageRequest.of(page, effectiveSize);
    }
}
