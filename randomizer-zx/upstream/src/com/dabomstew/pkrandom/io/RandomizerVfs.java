package com.dabomstew.pkrandom.io;

import java.io.FileNotFoundException;
import java.io.IOException;

public final class RandomizerVfs {
    private static VfsFileSystem fileSystem = new LocalVfsFileSystem();

    private RandomizerVfs() {
    }

    public static VfsFileSystem get() {
        return fileSystem;
    }

    public static void set(VfsFileSystem fileSystem) {
        if (fileSystem == null) {
            throw new IllegalArgumentException("fileSystem must not be null");
        }
        RandomizerVfs.fileSystem = fileSystem;
    }

    public static void reset() {
        fileSystem = new LocalVfsFileSystem();
    }

    public static byte[] readAllBytes(String path) throws IOException {
        if (!fileSystem.exists(path) || !fileSystem.isFile(path) || !fileSystem.canRead(path)) {
            throw new FileNotFoundException(path);
        }
        return fileSystem.readAllBytes(path);
    }
}
