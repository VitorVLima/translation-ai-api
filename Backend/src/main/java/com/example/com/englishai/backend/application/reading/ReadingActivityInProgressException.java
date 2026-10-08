package com.example.com.englishai.backend.application.reading;

public class ReadingActivityInProgressException extends RuntimeException {
    public ReadingActivityInProgressException() {
        super("You already have a reading activity in progress. Continue it before starting another.");
    }
}
