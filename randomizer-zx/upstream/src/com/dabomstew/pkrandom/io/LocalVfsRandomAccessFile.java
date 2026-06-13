package com.dabomstew.pkrandom.io;

import java.io.IOException;
import java.io.RandomAccessFile;

public final class LocalVfsRandomAccessFile implements VfsRandomAccessFile {
    private final RandomAccessFile file;

    public LocalVfsRandomAccessFile(String path, String mode) throws IOException {
        this.file = new RandomAccessFile(path, mode);
    }

    @Override
    public void seek(long position) throws IOException {
        file.seek(position);
    }

    @Override
    public long getFilePointer() throws IOException {
        return file.getFilePointer();
    }

    @Override
    public long length() throws IOException {
        return file.length();
    }

    @Override
    public void setLength(long length) throws IOException {
        file.setLength(length);
    }

    @Override
    public int read() throws IOException {
        return file.read();
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
        return file.read(buffer, offset, length);
    }

    @Override
    public void readFully(byte[] buffer) throws IOException {
        file.readFully(buffer);
    }

    @Override
    public void readFully(byte[] buffer, int offset, int length) throws IOException {
        file.readFully(buffer, offset, length);
    }

    @Override
    public byte readByte() throws IOException {
        return file.readByte();
    }

    @Override
    public void write(int value) throws IOException {
        file.write(value);
    }

    @Override
    public void write(byte[] buffer) throws IOException {
        file.write(buffer);
    }

    @Override
    public void write(byte[] buffer, int offset, int length) throws IOException {
        file.write(buffer, offset, length);
    }

    @Override
    public void writeByte(int value) throws IOException {
        file.writeByte(value);
    }

    @Override
    public void close() throws IOException {
        file.close();
    }
}
