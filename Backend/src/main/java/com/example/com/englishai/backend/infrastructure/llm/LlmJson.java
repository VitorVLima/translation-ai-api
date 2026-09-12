package com.example.com.englishai.backend.infrastructure.llm;

import com.example.com.englishai.backend.application.llm.LlmProviderException;

final class LlmJson {
    private LlmJson() {}
    static String quote(String value) {
        if (value == null) return "null";
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
    }
    static String stringField(String json, String field) {
        if (json == null || json.isBlank() || field == null || field.isBlank()) {
            throw new LlmProviderException("LLM provider response was invalid");
        }
        String key = quote(field);
        int searchFrom = 0;
        while ((searchFrom = json.indexOf(key, searchFrom)) >= 0) {
            int colon = searchFrom + key.length();
            while (colon < json.length() && Character.isWhitespace(json.charAt(colon))) colon++;
            if (colon < json.length() && json.charAt(colon++) == ':') {
                while (colon < json.length() && Character.isWhitespace(json.charAt(colon))) colon++;
                if (colon < json.length() && json.charAt(colon) == '"') return readString(json, colon + 1);
            }
            searchFrom += key.length();
        }
        throw new LlmProviderException("LLM provider response was invalid");
    }

    private static String readString(String json, int start) {
        StringBuilder result = new StringBuilder();
        boolean escaped = false;
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (escaped) {
                switch (c) {
                    case 'n' -> result.append('\n'); case 'r' -> result.append('\r');
                    case 't' -> result.append('\t'); case 'b' -> result.append('\b');
                    case 'f' -> result.append('\f'); case '"', '\\', '/' -> result.append(c);
                    case 'u' -> {
                        if (i + 4 >= json.length()) throw invalid();
                        try {
                            result.append((char) Integer.parseInt(json.substring(i + 1, i + 5), 16));
                        } catch (NumberFormatException e) {
                            throw invalid();
                        }
                        i += 4;
                    }
                    default -> result.append(c);
                }
                escaped = false;
            } else if (c == '\\') escaped = true;
            else if (c == '"') return result.toString();
            else result.append(c);
        }
        throw invalid();
    }

    private static LlmProviderException invalid() { return new LlmProviderException("LLM provider response was invalid"); }
}
