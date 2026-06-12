package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.FileFunctions;
import com.dabomstew.pkrandom.RandomSource;
import com.dabomstew.pkrandom.Randomizer;
import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.Version;
import com.dabomstew.pkrandom.romhandlers.Abstract3DSRomHandler;
import com.dabomstew.pkrandom.romhandlers.AbstractDSRomHandler;
import com.dabomstew.pkrandom.romhandlers.Gen1RomHandler;
import com.dabomstew.pkrandom.romhandlers.Gen2RomHandler;
import com.dabomstew.pkrandom.romhandlers.Gen3RomHandler;
import com.dabomstew.pkrandom.romhandlers.Gen4RomHandler;
import com.dabomstew.pkrandom.romhandlers.Gen5RomHandler;
import com.dabomstew.pkrandom.romhandlers.Gen6RomHandler;
import com.dabomstew.pkrandom.romhandlers.Gen7RomHandler;
import com.dabomstew.pkrandom.romhandlers.RomHandler;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.ResourceBundle;

public final class BrowserRandomizerAdapter {
    public static final String ADAPTER_VERSION = "0.1.0";

    private static final ResourceBundle BUNDLE =
            ResourceBundle.getBundle("com/dabomstew/pkrandom/newgui/Bundle");

    private BrowserRandomizerAdapter() {
    }

    public static RomInspection inspectRom(String sourceRomPath) {
        RomHandler romHandler = createLoadableHandler(sourceRomPath);
        if (romHandler == null) {
            return RomInspection.unsupported(sourceRomPath);
        }

        boolean loaded = romHandler.loadRom(sourceRomPath);
        if (!loaded) {
            return RomInspection.unsupported(sourceRomPath);
        }

        return new RomInspection(
                true,
                sourceRomPath,
                romHandler.getROMName(),
                romHandler.getROMCode(),
                romHandler.getSupportLevel(),
                romHandler.getDefaultExtension(),
                romHandler.generationOfPokemon(),
                romHandler instanceof Abstract3DSRomHandler,
                romHandler instanceof AbstractDSRomHandler
        );
    }

    public static RandomizerResponse randomize(RandomizerRequest request) {
        ByteArrayOutputStream logBytes = new ByteArrayOutputStream();
        PrintStream log = new PrintStream(logBytes, true, StandardCharsets.UTF_8);

        try {
            RomHandler romHandler = createLoadableHandler(request.sourceRomPath);
            if (romHandler == null) {
                return RandomizerResponse.error("Unsupported ROM", logBytes);
            }

            if (!romHandler.loadRom(request.sourceRomPath)) {
                return RandomizerResponse.error("Could not load ROM", logBytes);
            }

            boolean saveAsDirectory = request.saveAsDirectory;
            if (request.updatePath != null && !request.updatePath.isBlank()) {
                romHandler.loadGameUpdate(request.updatePath);
                if (romHandler.generationOfPokemon() == 6 || romHandler.generationOfPokemon() == 7) {
                    saveAsDirectory = true;
                }
            }

            if (saveAsDirectory && romHandler.generationOfPokemon() != 6 && romHandler.generationOfPokemon() != 7) {
                saveAsDirectory = false;
            }

            Settings settings = Settings.fromString(request.settingsString);
            settings.setCustomNames(FileFunctions.getCustomNames());
            Settings.TweakForROMFeedback feedback = settings.tweakForRom(romHandler);

            File outputFile = new File(request.outputPath);
            if (!saveAsDirectory) {
                List<String> bannedExtensions = new ArrayList<>(Arrays.asList("sgb", "gbc", "gba", "nds", "cxi"));
                bannedExtensions.remove(romHandler.getDefaultExtension());
                outputFile = FileFunctions.fixFilename(outputFile, romHandler.getDefaultExtension(), bannedExtensions);
                if (romHandler instanceof AbstractDSRomHandler || romHandler instanceof Abstract3DSRomHandler) {
                    String currentFilename = romHandler.loadedFilename();
                    if (currentFilename != null && currentFilename.equals(outputFile.getAbsolutePath())) {
                        return RandomizerResponse.error("Refusing to overwrite the loaded ROM", logBytes);
                    }
                }
            }

            Randomizer randomizer = new Randomizer(settings, romHandler, BUNDLE, saveAsDirectory);
            int checkValue = randomizer.randomize(outputFile.getAbsolutePath(), log, request.seed);

            return RandomizerResponse.ok(
                    checkValue,
                    outputFile.getAbsolutePath(),
                    Version.VERSION_STRING,
                    settings.toString(),
                    feedback.isChangedStarter(),
                    feedback.isRemovedCodeTweaks(),
                    logBytes
            );
        } catch (Exception error) {
            error.printStackTrace(log);
            return RandomizerResponse.error(error.getMessage(), logBytes);
        } finally {
            log.close();
        }
    }

    private static RomHandler createLoadableHandler(String sourceRomPath) {
        for (RomHandler.Factory factory : factories()) {
            if (factory.isLoadable(sourceRomPath)) {
                return factory.create(RandomSource.instance());
            }
        }
        return null;
    }

    private static RomHandler.Factory[] factories() {
        return new RomHandler.Factory[] {
                new Gen1RomHandler.Factory(),
                new Gen2RomHandler.Factory(),
                new Gen3RomHandler.Factory(),
                new Gen4RomHandler.Factory(),
                new Gen5RomHandler.Factory(),
                new Gen6RomHandler.Factory(),
                new Gen7RomHandler.Factory()
        };
    }

    public static final class RandomizerRequest {
        public String sourceRomPath;
        public String updatePath;
        public String outputPath;
        public String settingsString;
        public long seed;
        public boolean saveAsDirectory;

        public RandomizerRequest(
                String sourceRomPath,
                String updatePath,
                String outputPath,
                String settingsString,
                long seed,
                boolean saveAsDirectory
        ) {
            this.sourceRomPath = sourceRomPath;
            this.updatePath = updatePath;
            this.outputPath = outputPath;
            this.settingsString = settingsString;
            this.seed = seed;
            this.saveAsDirectory = saveAsDirectory;
        }
    }

    public static final class RomInspection {
        public final boolean supported;
        public final String sourceRomPath;
        public final String name;
        public final String code;
        public final String supportLevel;
        public final String defaultExtension;
        public final int generation;
        public final boolean nintendo3ds;
        public final boolean nintendoDs;

        private RomInspection(
                boolean supported,
                String sourceRomPath,
                String name,
                String code,
                String supportLevel,
                String defaultExtension,
                int generation,
                boolean nintendo3ds,
                boolean nintendoDs
        ) {
            this.supported = supported;
            this.sourceRomPath = sourceRomPath;
            this.name = name;
            this.code = code;
            this.supportLevel = supportLevel;
            this.defaultExtension = defaultExtension;
            this.generation = generation;
            this.nintendo3ds = nintendo3ds;
            this.nintendoDs = nintendoDs;
        }

        private static RomInspection unsupported(String sourceRomPath) {
            return new RomInspection(false, sourceRomPath, null, null, null, null, 0, false, false);
        }
    }

    public static final class RandomizerResponse {
        public final boolean ok;
        public final String error;
        public final int checkValue;
        public final String outputPath;
        public final String engineVersion;
        public final String settingsString;
        public final boolean changedStarter;
        public final boolean removedCodeTweaks;
        public final String log;

        private RandomizerResponse(
                boolean ok,
                String error,
                int checkValue,
                String outputPath,
                String engineVersion,
                String settingsString,
                boolean changedStarter,
                boolean removedCodeTweaks,
                String log
        ) {
            this.ok = ok;
            this.error = error;
            this.checkValue = checkValue;
            this.outputPath = outputPath;
            this.engineVersion = engineVersion;
            this.settingsString = settingsString;
            this.changedStarter = changedStarter;
            this.removedCodeTweaks = removedCodeTweaks;
            this.log = log;
        }

        private static RandomizerResponse ok(
                int checkValue,
                String outputPath,
                String engineVersion,
                String settingsString,
                boolean changedStarter,
                boolean removedCodeTweaks,
                ByteArrayOutputStream logBytes
        ) {
            return new RandomizerResponse(
                    true,
                    null,
                    checkValue,
                    outputPath,
                    engineVersion,
                    settingsString,
                    changedStarter,
                    removedCodeTweaks,
                    logString(logBytes)
            );
        }

        private static RandomizerResponse error(String error, ByteArrayOutputStream logBytes) {
            return new RandomizerResponse(false, error, 0, null, null, null, false, false, logString(logBytes));
        }

        private static String logString(ByteArrayOutputStream logBytes) {
            return logBytes.toString(StandardCharsets.UTF_8);
        }
    }
}
