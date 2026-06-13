package com.dabomstew.pkrandom.io;

import java.io.Closeable;
import java.io.IOException;

public interface VfsRandomAccessFile extends Closeable {
    void seek(long position) throws IOException;

    long getFilePointer() throws IOException;

    long length() throws IOException;

    void setLength(long length) throws IOException;

    int read() throws IOException;

    int read(byte[] buffer, int offset, int length) throws IOException;

    void readFully(byte[] buffer) throws IOException;

    void readFully(byte[] buffer, int offset, int length) throws IOException;

    byte readByte() throws IOException;

    void write(int value) throws IOException;

    void write(byte[] buffer) throws IOException;

    void write(byte[] buffer, int offset, int length) throws IOException;

    void writeByte(int value) throws IOException;
}
