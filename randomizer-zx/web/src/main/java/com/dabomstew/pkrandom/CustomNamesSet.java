package com.dabomstew.pkrandom;

/*----------------------------------------------------------------------------*/
/*--  CustomNamesSet.java - browser-safe custom name parsing for TeaVM       --*/
/*--                                                                        --*/
/*--  Adapted from Universal Pokemon Randomizer ZX. The public API and file --*/
/*--  format are preserved, but java.util.Scanner is avoided because TeaVM  --*/
/*--  WASM GC does not provide it.                                          --*/
/*----------------------------------------------------------------------------*/

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class CustomNamesSet {

    private List<String> trainerNames;
    private List<String> trainerClasses;
    private List<String> doublesTrainerNames;
    private List<String> doublesTrainerClasses;
    private List<String> pokemonNicknames;

    private static final int CUSTOM_NAMES_VERSION = 1;

    public CustomNamesSet(InputStream data) throws IOException {
        if (data.read() != CUSTOM_NAMES_VERSION) {
            throw new IOException("Invalid custom names file provided.");
        }

        trainerNames = readNamesBlock(data);
        trainerClasses = readNamesBlock(data);
        doublesTrainerNames = readNamesBlock(data);
        doublesTrainerClasses = readNamesBlock(data);
        pokemonNicknames = readNamesBlock(data);
    }

    public CustomNamesSet() {
        trainerNames = new ArrayList<>();
        trainerClasses = new ArrayList<>();
        doublesTrainerNames = new ArrayList<>();
        doublesTrainerClasses = new ArrayList<>();
        pokemonNicknames = new ArrayList<>();
    }

    private List<String> readNamesBlock(InputStream in) throws IOException {
        byte[] sizeData = FileFunctions.readFullyIntoBuffer(in, 4);
        int size = FileFunctions.readFullIntBigEndian(sizeData, 0);
        if (in.available() < size) {
            throw new IOException("Invalid size specified.");
        }

        return parseNames(FileFunctions.readFullyIntoBuffer(in, size));
    }

    public byte[] getBytes() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        baos.write(CUSTOM_NAMES_VERSION);

        writeNamesBlock(baos, trainerNames);
        writeNamesBlock(baos, trainerClasses);
        writeNamesBlock(baos, doublesTrainerNames);
        writeNamesBlock(baos, doublesTrainerClasses);
        writeNamesBlock(baos, pokemonNicknames);

        return baos.toByteArray();
    }

    private void writeNamesBlock(OutputStream out, List<String> names) throws IOException {
        String newLine = SysConstants.LINE_SEP;
        StringBuilder outNames = new StringBuilder();
        boolean first = true;
        for (String name : names) {
            if (!first) {
                outNames.append(newLine);
            }
            first = false;
            outNames.append(name);
        }
        byte[] namesData = outNames.toString().getBytes(StandardCharsets.UTF_8);
        byte[] sizeData = new byte[4];
        FileFunctions.writeFullIntBigEndian(sizeData, 0, namesData.length);
        out.write(sizeData);
        out.write(namesData);
    }

    public List<String> getTrainerNames() {
        return Collections.unmodifiableList(trainerNames);
    }

    public List<String> getTrainerClasses() {
        return Collections.unmodifiableList(trainerClasses);
    }

    public List<String> getDoublesTrainerNames() {
        return Collections.unmodifiableList(doublesTrainerNames);
    }

    public List<String> getDoublesTrainerClasses() {
        return Collections.unmodifiableList(doublesTrainerClasses);
    }

    public List<String> getPokemonNicknames() {
        return Collections.unmodifiableList(pokemonNicknames);
    }

    public void setTrainerNames(List<String> names) {
        trainerNames.clear();
        trainerNames.addAll(names);
    }

    public void setTrainerClasses(List<String> names) {
        trainerClasses.clear();
        trainerClasses.addAll(names);
    }

    public void setDoublesTrainerNames(List<String> names) {
        doublesTrainerNames.clear();
        doublesTrainerNames.addAll(names);
    }

    public void setDoublesTrainerClasses(List<String> names) {
        doublesTrainerClasses.clear();
        doublesTrainerClasses.addAll(names);
    }

    public void setPokemonNicknames(List<String> names) {
        pokemonNicknames.clear();
        pokemonNicknames.addAll(names);
    }

    public static CustomNamesSet importOldNames() throws FileNotFoundException {
        CustomNamesSet customNamesSet = new CustomNamesSet();

        if (FileFunctions.configExists(SysConstants.tnamesFile)) {
            for (String trainerName : readTextNames(SysConstants.tnamesFile)) {
                if (trainerName.contains("&")) {
                    customNamesSet.doublesTrainerNames.add(trainerName);
                } else {
                    customNamesSet.trainerNames.add(trainerName);
                }
            }
        }

        if (FileFunctions.configExists(SysConstants.tclassesFile)) {
            for (String trainerClassName : readTextNames(SysConstants.tclassesFile)) {
                String checkName = trainerClassName.toLowerCase();
                int idx = (checkName.endsWith("couple") || checkName.contains(" and ") || checkName.endsWith("kin")
                        || checkName.endsWith("team") || checkName.contains("&") || (checkName.endsWith("s") && !checkName
                        .endsWith("ss"))) ? 1 : 0;
                if (idx == 1) {
                    customNamesSet.doublesTrainerClasses.add(trainerClassName);
                } else {
                    customNamesSet.trainerClasses.add(trainerClassName);
                }
            }
        }

        if (FileFunctions.configExists(SysConstants.nnamesFile)) {
            customNamesSet.pokemonNicknames.addAll(readTextNames(SysConstants.nnamesFile));
        }

        return customNamesSet;
    }

    private static List<String> readTextNames(String filename) throws FileNotFoundException {
        InputStream input = FileFunctions.openConfig(filename);
        try {
            return parseNames(readAll(input));
        } catch (IOException e) {
            FileNotFoundException wrapped = new FileNotFoundException(filename);
            wrapped.initCause(e);
            throw wrapped;
        } finally {
            try {
                input.close();
            } catch (IOException ignored) {
            }
        }
    }

    private static byte[] readAll(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static List<String> parseNames(byte[] data) {
        return parseNames(new String(data, StandardCharsets.UTF_8));
    }

    private static List<String> parseNames(String text) {
        List<String> names = new ArrayList<>();
        int start = 0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\n' || ch == '\r') {
                addName(names, text.substring(start, i));
                if (ch == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    i++;
                }
                start = i + 1;
            }
        }
        if (start <= text.length()) {
            addName(names, text.substring(start));
        }
        return names;
    }

    private static void addName(List<String> names, String rawName) {
        String name = rawName.trim();
        if (name.startsWith("\uFEFF")) {
            name = name.substring(1);
        }
        if (!name.isEmpty()) {
            names.add(name);
        }
    }
}
