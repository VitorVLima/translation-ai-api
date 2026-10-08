export type CorrectionStatus = 'CORRECTED' | 'CORRECT_WITH_SUGGESTIONS' | 'CORRECT';

export type CorrectionExample = {
  text: string;
  translation: string;
};

export type CorrectionRequest = {
  text: string;
  language: 'en';
};

export type CorrectionResponse = {
  correctedText: string;
  status: CorrectionStatus;
  explanation: string | null;
  usageTip: string | null;
  alternatives: string[];
  examples: CorrectionExample[];
};
