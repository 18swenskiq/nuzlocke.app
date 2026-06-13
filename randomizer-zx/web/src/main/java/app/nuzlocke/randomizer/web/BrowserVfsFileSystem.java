package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.io.VfsFileSystem;
import com.dabomstew.pkrandom.io.VfsRandomAccessFile;
import org.teavm.jso.JSBody;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

public final class BrowserVfsFileSystem implements VfsFileSystem {
    @Override
    public boolean exists(String path) {
        return exists0(path);
    }

    @Override
    public boolean isFile(String path) {
        return isFile0(path);
    }

    @Override
    public boolean isDirectory(String path) {
        return isDirectory0(path);
    }

    @Override
    public boolean canRead(String path) {
        return exists(path);
    }

    @Override
    public boolean canWrite(String path) {
        return true;
    }

    @Override
    public long length(String path) {
        return length0(path);
    }

    @Override
    public byte[] readAllBytes(String path) throws IOException {
        if (!exists(path) || !isFile(path)) {
            throw new FileNotFoundException(path);
        }
        return read0(path, 0, (int) length(path));
    }

    @Override
    public void writeAllBytes(String path, byte[] data) {
        writeAll0(path, data);
    }

    @Override
    public void delete(String path) {
        delete0(path);
    }

    @Override
    public void mkdirs(String path) {
        mkdirs0(path);
    }

    @Override
    public List<String> list(String path) {
        return Arrays.asList(list0(path));
    }

    @Override
    public String name(String path) {
        String normalized = normalize(path);
        int slash = normalized.lastIndexOf('/');
        return slash >= 0 ? normalized.substring(slash + 1) : normalized;
    }

    @Override
    public String parent(String path) {
        String normalized = normalize(path);
        int slash = normalized.lastIndexOf('/');
        return slash > 0 ? normalized.substring(0, slash) : "/";
    }

    @Override
    public String join(String parent, String child) {
        String normalizedParent = normalize(parent);
        String normalizedChild = normalize(child);
        if (normalizedParent.endsWith("/")) {
            return normalizedParent + stripLeadingSlash(normalizedChild);
        }
        return normalizedParent + "/" + stripLeadingSlash(normalizedChild);
    }

    @Override
    public String separator() {
        return "/";
    }

    @Override
    public VfsRandomAccessFile openRandomAccess(String path, String mode) {
        if (mode.contains("w")) {
            ensureFile0(path);
        }
        return new BrowserVfsRandomAccessFile(path);
    }

    private static String normalize(String path) {
        if (path == null || path.isEmpty()) {
            return "/";
        }
        return path.replace('\\', '/');
    }

    private static String stripLeadingSlash(String path) {
        String result = path;
        while (result.startsWith("/")) {
            result = result.substring(1);
        }
        return result;
    }

    static byte[] read(String path, long position, int length) {
        return read0(path, position, length);
    }

    static void write(String path, long position, byte[] data) {
        write0(path, position, data);
    }

    static void setLength(String path, long length) {
        setLength0(path, length);
    }

    @JSBody(params = "path", script = "return globalThis.__uprzxVfs.exists(path);")
    private static native boolean exists0(String path);

    @JSBody(params = "path", script = "return globalThis.__uprzxVfs.isFile(path);")
    private static native boolean isFile0(String path);

    @JSBody(params = "path", script = "return globalThis.__uprzxVfs.isDirectory(path);")
    private static native boolean isDirectory0(String path);

    @JSBody(params = "path", script = "return BigInt(globalThis.__uprzxVfs.length(path));")
    private static native long length0(String path);

    @JSBody(params = { "path", "position", "length" }, script = "return globalThis.__uprzxVfs.read(path, Number(position), length);")
    private static native byte[] read0(String path, long position, int length);

    @JSBody(params = { "path", "position", "data" }, script = "globalThis.__uprzxVfs.write(path, Number(position), data);")
    private static native void write0(String path, long position, byte[] data);

    @JSBody(params = { "path", "data" }, script = "globalThis.__uprzxVfs.writeAll(path, data);")
    private static native void writeAll0(String path, byte[] data);

    @JSBody(params = "path", script = "globalThis.__uprzxVfs.delete(path);")
    private static native void delete0(String path);

    @JSBody(params = "path", script = "globalThis.__uprzxVfs.mkdirs(path);")
    private static native void mkdirs0(String path);

    @JSBody(params = "path", script = "return globalThis.__uprzxVfs.list(path);")
    private static native String[] list0(String path);

    @JSBody(params = "path", script = "globalThis.__uprzxVfs.ensureFile(path);")
    private static native void ensureFile0(String path);

    @JSBody(params = { "path", "length" }, script = "globalThis.__uprzxVfs.setLength(path, Number(length));")
    private static native void setLength0(String path, long length);
}
