package com.dabomstew.pkrandom.io;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.NoSuchElementException;

public final class TextScanner {
    private final String text;
    private int position;

    public TextScanner(InputStream input, String charsetName) {
        if (charsetName != null && !charsetName.equalsIgnoreCase("UTF-8")) {
            throw new IllegalArgumentException("TextScanner only supports UTF-8 in the browser build.");
        }
        this.text = new String(readAll(input), StandardCharsets.UTF_8);
        this.position = 0;
    }

    public boolean hasNextLine() {
        return position < text.length();
    }

    public String nextLine() {
        if (!hasNextLine()) {
            throw new NoSuchElementException();
        }

        int start = position;
        while (position < text.length()) {
            char ch = text.charAt(position);
            if (ch == '\n' || ch == '\r') {
                String line = text.substring(start, position);
                position++;
                if (ch == '\r' && position < text.length() && text.charAt(position) == '\n') {
                    position++;
                }
                return line;
            }
            position++;
        }
        return text.substring(start);
    }

    public void close() {
    }

    private static byte[] readAll(InputStream input) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        } finally {
            try {
                input.close();
            } catch (IOException ignored) {
            }
        }
    }
}
