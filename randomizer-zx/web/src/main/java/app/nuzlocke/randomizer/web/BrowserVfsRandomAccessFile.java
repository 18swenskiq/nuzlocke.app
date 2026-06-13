package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.io.VfsRandomAccessFile;

import java.io.EOFException;
import java.io.IOException;

public final class BrowserVfsRandomAccessFile implements VfsRandomAccessFile {
    private final String path;
    private long pointer;

    public BrowserVfsRandomAccessFile(String path) {
        this.path = path;
    }

    @Override
    public void seek(long position) {
        this.pointer = position;
    }

    @Override
    public long getFilePointer() {
        return pointer;
    }

    @Override
    public long length() {
        return BrowserRandomizerExports.vfsLength(path);
    }

    @Override
    public void setLength(long length) {
        BrowserVfsFileSystem.setLength(path, length);
        if (pointer > length) {
            pointer = length;
        }
    }

    @Override
    public int read() {
        byte[] bytes = BrowserVfsFileSystem.read(path, pointer, 1);
        if (bytes.length == 0) {
            return -1;
        }
        pointer++;
        return bytes[0] & 0xFF;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) {
        byte[] bytes = BrowserVfsFileSystem.read(path, pointer, length);
        if (bytes.length == 0) {
            return -1;
        }
        System.arraycopy(bytes, 0, buffer, offset, bytes.length);
        pointer += bytes.length;
        return bytes.length;
    }

    @Override
    public void readFully(byte[] buffer) throws IOException {
        readFully(buffer, 0, buffer.length);
    }

    @Override
    public void readFully(byte[] buffer, int offset, int length) throws IOException {
        byte[] bytes = BrowserVfsFileSystem.read(path, pointer, length);
        if (bytes.length < length) {
            throw new EOFException(path);
        }
        System.arraycopy(bytes, 0, buffer, offset, length);
        pointer += length;
    }

    @Override
    public byte readByte() throws IOException {
        int value = read();
        if (value < 0) {
            throw new EOFException(path);
        }
        return (byte) value;
    }

    @Override
    public void write(int value) {
        writeByte(value);
    }

    @Override
    public void write(byte[] buffer) {
        write(buffer, 0, buffer.length);
    }

    @Override
    public void write(byte[] buffer, int offset, int length) {
        byte[] bytes = buffer;
        if (offset != 0 || length != buffer.length) {
            bytes = new byte[length];
            System.arraycopy(buffer, offset, bytes, 0, length);
        }
        BrowserVfsFileSystem.write(path, pointer, bytes);
        pointer += length;
    }

    @Override
    public void writeByte(int value) {
        BrowserVfsFileSystem.write(path, pointer, new byte[] { (byte) value });
        pointer++;
    }

    @Override
    public void close() {
    }
}
