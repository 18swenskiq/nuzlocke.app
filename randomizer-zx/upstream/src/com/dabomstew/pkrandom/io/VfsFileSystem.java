package com.dabomstew.pkrandom.io;

import java.io.IOException;
import java.util.List;

public interface VfsFileSystem {
    boolean exists(String path) throws IOException;

    boolean isFile(String path) throws IOException;

    boolean isDirectory(String path) throws IOException;

    boolean canRead(String path) throws IOException;

    boolean canWrite(String path) throws IOException;

    long length(String path) throws IOException;

    byte[] readAllBytes(String path) throws IOException;

    void writeAllBytes(String path, byte[] data) throws IOException;

    void delete(String path) throws IOException;

    void mkdirs(String path) throws IOException;

    List<String> list(String path) throws IOException;

    String name(String path);

    String parent(String path);

    String join(String parent, String child);

    String separator();

    VfsRandomAccessFile openRandomAccess(String path, String mode) throws IOException;
}
