package com.example.com.englishai.backend.application.chat;

final record ChatResponseJson(String reply, boolean hasCorrection, String correctedText) {
    static ChatResponseJson parse(String json) {
        if (json == null) throw invalid();
        var parser = new Parser(json);
        parser.skipWhitespace(); parser.expect('{');
        String reply = null, corrected = null; Boolean hasCorrection = null;
        parser.skipWhitespace();
        if (!parser.peek('}')) {
            while (true) {
                String key = parser.string(); parser.skipWhitespace(); parser.expect(':'); parser.skipWhitespace();
                switch (key) {
                    case "reply" -> { if (reply != null) throw invalid(); reply = parser.string(); }
                    case "hasCorrection" -> { if (hasCorrection != null) throw invalid(); hasCorrection = parser.bool(); }
                    case "correctedText" -> { if (corrected != null) throw invalid(); corrected = parser.nullOrString(); }
                    default -> throw invalid();
                }
                parser.skipWhitespace(); if (parser.peek('}')) break; parser.expect(','); parser.skipWhitespace();
            }
        }
        parser.expect('}'); parser.skipWhitespace(); if (!parser.end() || reply == null || reply.isBlank() || hasCorrection == null) throw invalid();
        if (hasCorrection && (corrected == null || corrected.isBlank())) throw invalid();
        if (!hasCorrection) corrected = null;
        return new ChatResponseJson(reply, hasCorrection, corrected);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("invalid chat response"); }

    private static final class Parser {
        private final String value; private int position;
        Parser(String value) { this.value = value; }
        boolean end() { return position == value.length(); }
        boolean peek(char c) { return position < value.length() && value.charAt(position) == c; }
        void expect(char c) { if (!peek(c)) throw invalid(); position++; }
        void skipWhitespace() { while (position < value.length() && Character.isWhitespace(value.charAt(position))) position++; }
        String string() {
            expect('"'); var result = new StringBuilder();
            while (position < value.length()) { char c = value.charAt(position++); if (c == '"') return result.toString(); if (c < 0x20) throw invalid();
                if (c != '\\') { result.append(c); continue; } if (position >= value.length()) throw invalid();
                c = value.charAt(position++); switch (c) { case '"', '\\', '/' -> result.append(c); case 'b' -> result.append('\b'); case 'f' -> result.append('\f'); case 'n' -> result.append('\n'); case 'r' -> result.append('\r'); case 't' -> result.append('\t'); case 'u' -> { if (position + 4 > value.length()) throw invalid(); try { result.append((char) Integer.parseInt(value.substring(position, position + 4), 16)); } catch (NumberFormatException e) { throw invalid(); } position += 4; } default -> throw invalid(); }
            } throw invalid();
        }
        String nullOrString() { if (value.startsWith("null", position)) { position += 4; return null; } return string(); }
        boolean bool() { if (value.startsWith("true", position)) { position += 4; return true; } if (value.startsWith("false", position)) { position += 5; return false; } throw invalid(); }
    }
}
