package com.dabomstew.pkrandom.io;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public final class LocalVfsFileSystem implements VfsFileSystem {
    @Override
    public boolean exists(String path) {
        return new File(path).exists();
    }

    @Override
    public boolean isFile(String path) {
        return new File(path).isFile();
    }

    @Override
    public boolean isDirectory(String path) {
        return new File(path).isDirectory();
    }

    @Override
    public boolean canRead(String path) {
        return new File(path).canRead();
    }

    @Override
    public boolean canWrite(String path) {
        return new File(path).canWrite();
    }

    @Override
    public long length(String path) {
        return new File(path).length();
    }

    @Override
    public byte[] readAllBytes(String path) throws IOException {
        FileInputStream fis = new FileInputStream(path);
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = fis.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        } finally {
            fis.close();
        }
    }

    @Override
    public void writeAllBytes(String path, byte[] data) throws IOException {
        File parent = new File(path).getParentFile();
        if (parent != null) {
            parent.mkdirs();
        }
        FileOutputStream fos = new FileOutputStream(path);
        try {
            fos.write(data);
        } finally {
            fos.close();
        }
    }

    @Override
    public void delete(String path) {
        new File(path).delete();
    }

    @Override
    public void mkdirs(String path) {
        new File(path).mkdirs();
    }

    @Override
    public List<String> list(String path) {
        File[] files = new File(path).listFiles();
        List<String> result = new ArrayList<>();
        if (files != null) {
            for (File file : files) {
                result.add(file.getPath());
            }
        }
        return result;
    }

    @Override
    public String name(String path) {
        return new File(path).getName();
    }

    @Override
    public String parent(String path) {
        File parent = new File(path).getParentFile();
        return parent == null ? null : parent.getPath();
    }

    @Override
    public String join(String parent, String child) {
        return new File(parent, child).getPath();
    }

    @Override
    public String separator() {
        return File.separator;
    }

    @Override
    public VfsRandomAccessFile openRandomAccess(String path, String mode) throws IOException {
        return new LocalVfsRandomAccessFile(path, mode);
    }
}
