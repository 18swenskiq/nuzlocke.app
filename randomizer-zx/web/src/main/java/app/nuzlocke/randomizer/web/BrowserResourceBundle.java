package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.io.TextScanner;

import java.io.InputStream;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.ResourceBundle;

public final class BrowserResourceBundle extends ResourceBundle {
    private static final String BUNDLE_PATH = "/com/dabomstew/pkrandom/newgui/Bundle.properties";

    private final Map<String, String> values;

    private BrowserResourceBundle(Map<String, String> values) {
        this.values = values;
    }

    public static BrowserResourceBundle load() {
        Map<String, String> values = new LinkedHashMap<>();
        InputStream stream = BrowserResourceBundle.class.getResourceAsStream(BUNDLE_PATH);
        if (stream == null) {
            return new BrowserResourceBundle(values);
        }

        TextScanner scanner = new TextScanner(stream, "UTF-8");
        while (scanner.hasNextLine()) {
            String line = scanner.nextLine();
            if (isIgnored(line)) {
                continue;
            }
            int separator = separatorIndex(line);
            if (separator < 0) {
                values.put(unescape(line.trim()), "");
            } else {
                String key = line.substring(0, separator).trim();
                String value = line.substring(separator + 1).trim();
                values.put(unescape(key), unescape(value));
            }
        }
        scanner.close();

        return new BrowserResourceBundle(values);
    }

    @Override
    protected Object handleGetObject(String key) {
        String value = values.get(key);
        return value == null ? key : value;
    }

    @Override
    public Enumeration<String> getKeys() {
        return Collections.enumeration(values.keySet());
    }

    private static boolean isIgnored(String line) {
        String trimmed = line.trim();
        return trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("!");
    }

    private static int separatorIndex(String line) {
        boolean escaped = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch == '\\') {
                escaped = true;
                continue;
            }
            if (ch == '=' || ch == ':') {
                return i;
            }
        }
        return -1;
    }

    private static String unescape(String value) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch != '\\' || i + 1 >= value.length()) {
                out.append(ch);
                continue;
            }

            char next = value.charAt(++i);
            switch (next) {
                case 'n':
                    out.append('\n');
                    break;
                case 'r':
                    out.append('\r');
                    break;
                case 't':
                    out.append('\t');
                    break;
                case 'f':
                    out.append('\f');
                    break;
                case 'u':
                    if (i + 4 < value.length()) {
                        String hex = value.substring(i + 1, i + 5);
                        try {
                            out.append((char) Integer.parseInt(hex, 16));
                            i += 4;
                        } catch (NumberFormatException ignored) {
                            out.append("\\u");
                        }
                    } else {
                        out.append("\\u");
                    }
                    break;
                default:
                    out.append(next);
                    break;
            }
        }
        return out.toString();
    }
}
