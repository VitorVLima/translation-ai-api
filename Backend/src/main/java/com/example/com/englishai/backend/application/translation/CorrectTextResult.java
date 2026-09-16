package com.example.com.englishai.backend.application.translation;

import java.util.List;
public record CorrectTextResult(String correctedText, CorrectionStatus status, String explanation, String usageTip, List<CorrectionExample> examples, List<String> alternatives) {
    public CorrectTextResult(String correctedText) { this(correctedText, CorrectionStatus.CORRECTED, null, null, List.of(), List.of()); }
    public CorrectTextResult {
        if (correctedText == null || correctedText.isBlank()) throw new IllegalArgumentException("corrected text is empty");
        status = status == null ? CorrectionStatus.CORRECTED : status;
        examples = examples == null ? List.of() : List.copyOf(examples);
        alternatives = alternatives == null ? List.of() : List.copyOf(alternatives);
    }
}
