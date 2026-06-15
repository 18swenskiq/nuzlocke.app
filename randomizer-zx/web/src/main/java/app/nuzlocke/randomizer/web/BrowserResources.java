package app.nuzlocke.randomizer.web;

import org.teavm.jso.JSBody;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

public final class BrowserResources {
    private BrowserResources() {
    }

    public static boolean exists(String path) {
        return exists0(normalize(path));
    }

    public static InputStream open(String path) {
        byte[] bytes = read(normalize(path));
        return bytes == null ? null : new ByteArrayInputStream(bytes);
    }

    private static byte[] read(String path) {
        int length = length0(path);
        if (length < 0) {
            return null;
        }

        byte[] bytes = new byte[length];
        for (int i = 0; i < length; i++) {
            bytes[i] = (byte) byteAt0(path, i);
        }
        return bytes;
    }

    private static String normalize(String path) {
        String normalized = path == null ? "" : path.replace('\\', '/');
        while (normalized.startsWith("/")) {
            normalized = normalized.substring(1);
        }
        return normalized;
    }

    @JSBody(params = "path", script = ""
            + "const resources = globalThis.__uprzxResources;"
            + "return !!resources && resources.has(path);")
    private static native boolean exists0(String path);

    @JSBody(params = "path", script = ""
            + "const resources = globalThis.__uprzxResources;"
            + "const bytes = resources && resources.get(path);"
            + "return bytes ? bytes.length : -1;")
    private static native int length0(String path);

    @JSBody(params = { "path", "index" }, script = ""
            + "const resources = globalThis.__uprzxResources;"
            + "const bytes = resources && resources.get(path);"
            + "return bytes && index >= 0 && index < bytes.length ? bytes[index] : -1;")
    private static native int byteAt0(String path, int index);
}
