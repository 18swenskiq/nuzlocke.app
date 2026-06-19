package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.FileFunctions;
import com.dabomstew.pkrandom.RandomSource;
import com.dabomstew.pkrandom.Randomizer;
import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.Version;
import com.dabomstew.pkrandom.io.RandomizerVfs;
import com.dabomstew.pkrandom.io.VfsFileSystem;
import com.dabomstew.pkrandom.io.VfsRandomAccessFile;
import com.dabomstew.pkrandom.pokemon.Encounter;
import com.dabomstew.pkrandom.pokemon.EncounterSet;
import com.dabomstew.pkrandom.pokemon.Move;
import com.dabomstew.pkrandom.pokemon.MoveCategory;
import com.dabomstew.pkrandom.pokemon.Pokemon;
import com.dabomstew.pkrandom.pokemon.StaticEncounter;
import com.dabomstew.pkrandom.pokemon.Trainer;
import com.dabomstew.pkrandom.pokemon.TrainerPokemon;
import com.dabomstew.pkrandom.pokemon.Type;
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
import java.io.InputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.ResourceBundle;
import java.util.Set;

public final class BrowserRandomizerAdapter {
    public static final String ADAPTER_VERSION = "0.1.0";

    private static final ResourceBundle BUNDLE = BrowserResourceBundle.load();

    private BrowserRandomizerAdapter() {
    }

    public static RomInspection inspectRom(String sourceRomPath) {
        List<String> handlerDiagnostics = new ArrayList<>();
        RomHandler romHandler = createLoadableHandler(sourceRomPath, handlerDiagnostics);
        if (romHandler == null) {
            return RomInspection.unsupported(sourceRomPath, diagnosticsJson(sourceRomPath, handlerDiagnostics));
        }

        boolean loaded;
        try {
            loaded = romHandler.loadRom(sourceRomPath);
        } catch (Throwable error) {
            handlerDiagnostics.add("{"
                    + "\"handler\":" + quote(romHandler.getClass().getSimpleName()) + ","
                    + "\"stage\":\"loadRom\","
                    + "\"exception\":" + quote(error.getClass().getName()) + ","
                    + "\"message\":" + quote(error.getMessage())
                    + "}");
            return RomInspection.unsupported(sourceRomPath, diagnosticsJson(sourceRomPath, handlerDiagnostics));
        }
        if (!loaded) {
            handlerDiagnostics.add("{"
                    + "\"handler\":" + quote(romHandler.getClass().getSimpleName()) + ","
                    + "\"stage\":\"loadRom\","
                    + "\"loadable\":false"
                    + "}");
            return RomInspection.unsupported(sourceRomPath, diagnosticsJson(sourceRomPath, handlerDiagnostics));
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
                romHandler instanceof AbstractDSRomHandler,
                romHandler.isRomValid(),
                BrowserRandomizerSchema.forRom(romHandler, BUNDLE),
                null
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
            if (!romHandler.isRomValid()) {
                return RandomizerResponse.error("UPR-ZX recognized this ROM, but it does not appear to be a clean official ROM.", logBytes);
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

            String outputPath = request.outputPath;
            if (!saveAsDirectory) {
                List<String> bannedExtensions = new ArrayList<>(Arrays.asList("sgb", "gbc", "gba", "nds", "cxi"));
                bannedExtensions.remove(romHandler.getDefaultExtension());
                outputPath = FileFunctions.fixFilenamePath(outputPath, romHandler.getDefaultExtension(), bannedExtensions);
                if (romHandler instanceof AbstractDSRomHandler || romHandler instanceof Abstract3DSRomHandler) {
                    String currentFilename = romHandler.loadedFilename();
                    if (currentFilename != null && currentFilename.equals(outputPath)) {
                        return RandomizerResponse.error("Refusing to overwrite the loaded ROM", logBytes);
                    }
                }
            }

            Map<Integer, String> originalTrainerSnapshots = trainerSnapshotMap(romHandler);

            Randomizer randomizer = new Randomizer(settings, romHandler, BUNDLE, saveAsDirectory);
            int checkValue = randomizer.randomize(outputPath, log, request.seed);
            String extractedDataJson = extractTrackerData(romHandler, settings, originalTrainerSnapshots);

            return RandomizerResponse.ok(
                    checkValue,
                    outputPath,
                    Version.VERSION_STRING,
                    settings.toString(),
                    feedback.isChangedStarter(),
                    feedback.isRemovedCodeTweaks(),
                    extractedDataJson,
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
        return createLoadableHandler(sourceRomPath, null);
    }

    private static RomHandler createLoadableHandler(String sourceRomPath, List<String> diagnostics) {
        for (RomHandler.Factory factory : factories()) {
            String handlerName = factoryName(factory);
            try {
                boolean loadable = factory.isLoadable(sourceRomPath);
                if (diagnostics != null) {
                    diagnostics.add("{"
                            + "\"handler\":" + quote(handlerName) + ","
                            + "\"stage\":\"isLoadable\","
                            + "\"loadable\":" + loadable
                            + "}");
                }
                if (!loadable) {
                    continue;
                }
                return factory.create(RandomSource.instance());
            } catch (Throwable error) {
                if (diagnostics != null) {
                    diagnostics.add("{"
                            + "\"handler\":" + quote(handlerName) + ","
                            + "\"stage\":\"isLoadable\","
                            + "\"exception\":" + quote(error.getClass().getName()) + ","
                            + "\"message\":" + quote(error.getMessage())
                            + "}");
                }
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

    private static String factoryName(RomHandler.Factory factory) {
        if (factory instanceof Gen1RomHandler.Factory) {
            return "Gen1RomHandler";
        }
        if (factory instanceof Gen2RomHandler.Factory) {
            return "Gen2RomHandler";
        }
        if (factory instanceof Gen3RomHandler.Factory) {
            return "Gen3RomHandler";
        }
        if (factory instanceof Gen4RomHandler.Factory) {
            return "Gen4RomHandler";
        }
        if (factory instanceof Gen5RomHandler.Factory) {
            return "Gen5RomHandler";
        }
        if (factory instanceof Gen6RomHandler.Factory) {
            return "Gen6RomHandler";
        }
        if (factory instanceof Gen7RomHandler.Factory) {
            return "Gen7RomHandler";
        }
        return "UnknownRomHandler";
    }

    private static String diagnosticsJson(String sourceRomPath, List<String> handlerDiagnostics) {
        return "{"
                + "\"file\":" + fileDiagnosticsJson(sourceRomPath) + ","
                + "\"resources\":" + resourceDiagnosticsJson() + ","
                + "\"handlers\":[" + join(handlerDiagnostics) + "]"
                + "}";
    }

    private static String fileDiagnosticsJson(String sourceRomPath) {
        VfsFileSystem vfs = RandomizerVfs.get();
        boolean exists = false;
        boolean isFile = false;
        boolean canRead = false;
        long length = -1;
        byte[] header = new byte[0];
        String exception = null;
        String message = null;

        try {
            exists = vfs.exists(sourceRomPath);
            isFile = vfs.isFile(sourceRomPath);
            canRead = vfs.canRead(sourceRomPath);
            length = vfs.length(sourceRomPath);
            header = readHeader(sourceRomPath, 0x150);
        } catch (Exception error) {
            exception = error.getClass().getName();
            message = error.getMessage();
        }

        return "{"
                + "\"path\":" + quote(sourceRomPath) + ","
                + "\"exists\":" + exists + ","
                + "\"isFile\":" + isFile + ","
                + "\"canRead\":" + canRead + ","
                + "\"length\":" + length + ","
                + "\"read336Length\":" + readProbeLength(sourceRomPath, 0x150) + ","
                + "\"read4096Length\":" + readProbeLength(sourceRomPath, 0x1000) + ","
                + "\"read1MiBLength\":" + readProbeLength(sourceRomPath, 0x100000) + ","
                + "\"first16\":" + quote(hex(header, 0, Math.min(16, header.length))) + ","
                + "\"gbTitle\":" + quote(ascii(header, 0x134, 16)) + ","
                + "\"gbCode\":" + quote(ascii(header, 0x13F, 4)) + ","
                + "\"gbDestinationCode\":" + byteValue(header, 0x14A) + ","
                + "\"gbVersion\":" + byteValue(header, 0x14C) + ","
                + "\"gbHeaderChecksum\":" + quote(hex(header, 0x14D, 1)) + ","
                + "\"gbGlobalChecksum\":" + quote(hex(header, 0x14E, 2)) + ","
                + "\"gbaTitle\":" + quote(ascii(header, 0xA0, 12)) + ","
                + "\"gbaCode\":" + quote(ascii(header, 0xAC, 4)) + ","
                + "\"gbaMaker\":" + quote(ascii(header, 0xB0, 2)) + ","
                + "\"gbaVersion\":" + byteValue(header, 0xBC)
                + (exception == null ? "" : ",\"exception\":" + quote(exception) + ",\"message\":" + quote(message))
                + "}";
    }

    private static String resourceDiagnosticsJson() {
        String[] names = new String[] {
                "gen1_offsets.ini",
                "gen2_offsets.ini",
                "gen3_offsets.ini",
                "gen4_offsets.ini",
                "gen5_offsets.ini",
                "gen6_offsets.ini",
                "gen7_offsets.ini"
        };
        List<String> entries = new ArrayList<>();
        for (String name : names) {
            entries.add(quote(name) + ":" + configExists(name));
        }
        return "{" + join(entries) + "}";
    }

    private static boolean configExists(String name) {
        InputStream stream = null;
        try {
            stream = FileFunctions.openConfig(name);
            return stream != null;
        } catch (Throwable ignored) {
            return false;
        } finally {
            if (stream != null) {
                try {
                    stream.close();
                } catch (Exception ignored) {
                    // Diagnostic helper only.
                }
            }
        }
    }

    private static int readProbeLength(String sourceRomPath, int length) {
        VfsRandomAccessFile file = null;
        try {
            file = RandomizerVfs.get().openRandomAccess(sourceRomPath, "r");
            byte[] buffer = new byte[length];
            int read = file.read(buffer, 0, length);
            return Math.max(read, 0);
        } catch (Exception ignored) {
            return -1;
        } finally {
            if (file != null) {
                try {
                    file.close();
                } catch (Exception ignored) {
                    // Diagnostic helper only.
                }
            }
        }
    }

    private static byte[] readHeader(String sourceRomPath, int length) throws Exception {
        VfsRandomAccessFile file = RandomizerVfs.get().openRandomAccess(sourceRomPath, "r");
        try {
            byte[] buffer = new byte[length];
            int read = file.read(buffer, 0, length);
            if (read <= 0) {
                return new byte[0];
            }
            if (read == length) {
                return buffer;
            }
            byte[] partial = new byte[read];
            System.arraycopy(buffer, 0, partial, 0, read);
            return partial;
        } finally {
            file.close();
        }
    }

    private static String ascii(byte[] bytes, int offset, int length) {
        if (offset < 0 || length <= 0 || offset + length > bytes.length) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        for (int i = offset; i < offset + length; i++) {
            int value = bytes[i] & 0xFF;
            if (value >= 32 && value <= 126) {
                out.append((char) value);
            }
        }
        return out.toString().trim();
    }

    private static int byteValue(byte[] bytes, int offset) {
        if (offset < 0 || offset >= bytes.length) {
            return -1;
        }
        return bytes[offset] & 0xFF;
    }

    private static String hex(byte[] bytes, int offset, int length) {
        if (offset < 0 || length <= 0 || offset >= bytes.length) {
            return "";
        }
        int end = Math.min(bytes.length, offset + length);
        StringBuilder out = new StringBuilder();
        for (int i = offset; i < end; i++) {
            if (out.length() > 0) {
                out.append(' ');
            }
            String value = Integer.toHexString(bytes[i] & 0xFF).toUpperCase();
            if (value.length() < 2) {
                out.append('0');
            }
            out.append(value);
        }
        return out.toString();
    }

    private static String extractTrackerData(
            RomHandler romHandler,
            Settings settings,
            Map<Integer, String> originalTrainerSnapshots
    ) {
        List<String> routeEntries = new ArrayList<>();
        List<String> leagueEntries = new ArrayList<>();
        List<String> importantTrainerEntries = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        addStarterRoute(routeEntries, warnings, romHandler);
        addWildRoutes(routeEntries, warnings, romHandler, settings);
        addStaticRoute(routeEntries, warnings, romHandler);
        addImportantTrainers(routeEntries, leagueEntries, importantTrainerEntries, warnings, romHandler, originalTrainerSnapshots);

        String routeJson = "[" + join(routeEntries) + "]";
        String leagueJson = "{" + join(leagueEntries) + "}";
        String importantTrainerJson = "[" + join(importantTrainerEntries) + "]";
        return "{"
                + "\"route\":" + routeJson + ","
                + "\"routes\":" + routeJson + ","
                + "\"league\":" + leagueJson + ","
                + "\"trainers\":{"
                + "\"league\":" + leagueJson + ","
                + "\"important\":" + importantTrainerJson + ","
                + "\"pairs\":" + importantTrainerJson + ","
                + "\"importantCount\":" + importantTrainerEntries.size()
                + "},"
                + "\"warnings\":[" + join(warnings) + "]"
                + "}";
    }

    private static void addStarterRoute(List<String> routeEntries, List<String> warnings, RomHandler romHandler) {
        try {
            List<Pokemon> starters = romHandler.getPickedStarters();
            if (starters == null || starters.isEmpty()) {
                starters = romHandler.getStarters();
            }

            List<String> starterNames = pokemonNames(starters);
            if (!starterNames.isEmpty()) {
                routeEntries.add(routeEntry("Starter", starterNames, "upr-zx-starters"));
            }
        } catch (Exception e) {
            warnings.add(warningJson("STARTERS_EXTRACT_FAILED", e));
        }
    }

    private static void addWildRoutes(
            List<String> routeEntries,
            List<String> warnings,
            RomHandler romHandler,
            Settings settings
    ) {
        try {
            boolean useTimeOfDay = settings != null && settings.isUseTimeBasedEncounters();
            List<EncounterSet> encounterSets = romHandler.getEncounters(useTimeOfDay);
            for (int i = 0; i < encounterSets.size(); i++) {
                EncounterSet set = encounterSets.get(i);
                List<String> encounters = new ArrayList<>();
                Set<String> seen = new LinkedHashSet<>();
                for (Encounter encounter : set.encounters) {
                    if (encounter == null || encounter.pokemon == null) {
                        continue;
                    }
                    String name = pokemonSlug(encounter.pokemon, "");
                    if (!name.isEmpty() && seen.add(name)) {
                        encounters.add(name);
                    }
                }
                if (encounters.isEmpty()) {
                    continue;
                }

                String displayName = set.displayName == null || set.displayName.trim().isEmpty()
                        ? "Encounter Area " + (i + 1)
                        : set.displayName.trim();
                routeEntries.add(routeEntry(displayName, encounters, "upr-zx-wild", set.rate));
            }
        } catch (Exception e) {
            warnings.add(warningJson("WILD_EXTRACT_FAILED", e));
        }
    }

    private static void addStaticRoute(List<String> routeEntries, List<String> warnings, RomHandler romHandler) {
        try {
            List<StaticEncounter> statics = romHandler.getStaticPokemon();
            List<String> staticNames = new ArrayList<>();
            Set<String> seen = new LinkedHashSet<>();
            for (StaticEncounter encounter : statics) {
                if (encounter == null || encounter.pkmn == null) {
                    continue;
                }
                String name = pokemonSlug(encounter.pkmn, "");
                if (!name.isEmpty() && seen.add(name)) {
                    staticNames.add(name);
                }
            }
            if (!staticNames.isEmpty()) {
                routeEntries.add(routeEntry("Static Encounters", staticNames, "upr-zx-static"));
            }
        } catch (Exception e) {
            warnings.add(warningJson("STATIC_EXTRACT_FAILED", e));
        }
    }

    private static void addImportantTrainers(
            List<String> routeEntries,
            List<String> leagueEntries,
            List<String> importantTrainerEntries,
            List<String> warnings,
            RomHandler romHandler,
            Map<Integer, String> originalTrainerSnapshots
    ) {
        try {
            List<Trainer> trainers = romHandler.getTrainers();
            for (Trainer trainer : trainers) {
                if (!isTrackerTrainer(trainer)) {
                    continue;
                }

                String id = "trainer-" + trainer.index;
                String group = trainerGroup(trainer);
                String label = trainerLabel(trainer);
                routeEntries.add(gymRouteEntry(id, group, label));
                leagueEntries.add(quote(id) + ":" + trainerJson(id, trainer, romHandler));
                importantTrainerEntries.add(trainerPairJson(id, trainer, romHandler, originalTrainerSnapshots));
            }
        } catch (Exception e) {
            warnings.add(warningJson("TRAINERS_EXTRACT_FAILED", e));
        }
    }

    private static boolean isTrackerTrainer(Trainer trainer) {
        return trainer != null
                && !trainer.skipImportant()
                && (trainer.isBoss() || trainer.isImportant() || trainer.importantTrainer);
    }

    private static String trainerJson(String id, Trainer trainer, RomHandler romHandler) {
        return "{"
                + "\"id\":" + quote(id) + ","
                + "\"index\":" + trainer.index + ","
                + "\"offset\":" + trainer.offset + ","
                + "\"trainerClass\":" + trainer.trainerclass + ","
                + "\"name\":" + quote(trainerLabel(trainer)) + ","
                + "\"displayName\":" + quote(trainer.fullDisplayName) + ","
                + "\"tag\":" + quote(trainer.tag) + ","
                + "\"group\":" + quote(trainerGroup(trainer)) + ","
                + "\"important\":" + isTrackerTrainer(trainer) + ","
                + "\"boss\":" + trainer.isBoss() + ","
                + "\"speciality\":\"\","
                + "\"img\":null,"
                + "\"pokemon\":[" + join(trainerPokemonJson(trainer, romHandler)) + "]"
                + "}";
    }

    private static Map<Integer, String> trainerSnapshotMap(RomHandler romHandler) {
        Map<Integer, String> snapshots = new LinkedHashMap<>();
        try {
            List<Trainer> trainers = romHandler.getTrainers();
            for (Trainer trainer : trainers) {
                if (trainer == null) {
                    continue;
                }
                String id = "trainer-" + trainer.index;
                snapshots.put(trainer.index, trainerJson(id, trainer, romHandler));
            }
        } catch (Exception ignored) {
            // Trainer snapshots are used as matching hints only.
        }
        return snapshots;
    }

    private static String trainerPairJson(
            String id,
            Trainer trainer,
            RomHandler romHandler,
            Map<Integer, String> originalTrainerSnapshots
    ) {
        String original = originalTrainerSnapshots == null ? null : originalTrainerSnapshots.get(trainer.index);
        return "{"
                + "\"id\":" + quote(id) + ","
                + "\"index\":" + trainer.index + ","
                + "\"tag\":" + quote(trainer.tag) + ","
                + "\"name\":" + quote(trainerLabel(trainer)) + ","
                + "\"group\":" + quote(trainerGroup(trainer)) + ","
                + "\"important\":" + isTrackerTrainer(trainer) + ","
                + "\"boss\":" + trainer.isBoss() + ","
                + "\"original\":" + (original == null ? "null" : original) + ","
                + "\"randomized\":" + trainerJson(id, trainer, romHandler)
                + "}";
    }

    private static List<String> trainerPokemonJson(Trainer trainer, RomHandler romHandler) {
        List<String> pokemon = new ArrayList<>();
        if (trainer.pokemon == null) {
            return pokemon;
        }
        for (TrainerPokemon trainerPokemon : trainer.pokemon) {
            if (trainerPokemon == null || trainerPokemon.pokemon == null) {
                continue;
            }
            pokemon.add("{"
                    + "\"name\":" + quote(pokemonSlug(trainerPokemon.pokemon, trainerPokemon.formeSuffix)) + ","
                    + "\"number\":" + trainerPokemon.pokemon.number + ","
                    + "\"sprite\":" + quote(String.valueOf(trainerPokemon.pokemon.number)) + ","
                    + "\"level\":" + quote(String.valueOf(trainerPokemon.level)) + ","
                    + "\"types\":" + typeArrayJson(trainerPokemon.pokemon) + ","
                    + "\"moves\":" + movesJson(trainerPokemon, romHandler) + ","
                    + "\"stats\":" + statsJson(trainerPokemon.pokemon) + ","
                    + "\"ability\":" + abilityJson(trainerPokemon, romHandler) + ","
                    + "\"abilities\":[],"
                    + "\"held\":" + heldItemJson(trainerPokemon, romHandler)
                    + "}");
        }
        return pokemon;
    }

    private static String movesJson(TrainerPokemon trainerPokemon, RomHandler romHandler) {
        try {
            List<Move> moves = romHandler.getMoves();
            List<String> moveJson = new ArrayList<>();
            if (trainerPokemon.moves == null || moves == null) {
                return "[]";
            }
            for (int moveId : trainerPokemon.moves) {
                if (moveId <= 0 || moveId >= moves.size()) {
                    continue;
                }
                Move move = moves.get(moveId);
                if (move == null || move.name == null || move.name.trim().isEmpty()) {
                    continue;
                }
                moveJson.add("{"
                        + "\"name\":" + quote(slug(move.name)) + ","
                        + "\"power\":" + Math.max(0, move.power) + ","
                        + "\"type\":" + quote(typeSlug(move.type)) + ","
                        + "\"damage_class\":" + quote(moveCategorySlug(move.category)) + ","
                        + "\"priority\":" + move.priority
                        + "}");
            }
            return "[" + join(moveJson) + "]";
        } catch (Exception e) {
            return "[]";
        }
    }

    private static String abilityJson(TrainerPokemon trainerPokemon, RomHandler romHandler) {
        try {
            int abilityNumber = romHandler.getAbilityForTrainerPokemon(trainerPokemon);
            String abilityName = abilityNumber > 0 ? romHandler.abilityName(abilityNumber) : null;
            if (abilityName == null || abilityName.trim().isEmpty()) {
                return "null";
            }
            return "{"
                    + "\"name\":" + quote(abilityName.trim()) + ","
                    + "\"sprite\":" + quote(slug(abilityName)) + ","
                    + "\"effect\":\"\""
                    + "}";
        } catch (Exception e) {
            return "null";
        }
    }

    private static String heldItemJson(TrainerPokemon trainerPokemon, RomHandler romHandler) {
        try {
            if (trainerPokemon.heldItem <= 0) {
                return "null";
            }
            String[] items = romHandler.getItemNames();
            if (items == null || trainerPokemon.heldItem >= items.length) {
                return "null";
            }
            String itemName = items[trainerPokemon.heldItem];
            if (itemName == null || itemName.trim().isEmpty()) {
                return "null";
            }
            return "{"
                    + "\"name\":" + quote(itemName.trim()) + ","
                    + "\"sprite\":" + quote(slug(itemName)) + ","
                    + "\"effect\":\"\""
                    + "}";
        } catch (Exception e) {
            return "null";
        }
    }

    private static String routeEntry(String name, List<String> encounters, String source) {
        return routeEntry(name, encounters, source, -1);
    }

    private static String routeEntry(String name, List<String> encounters, String source, int rate) {
        return "{"
                + "\"type\":\"route\","
                + "\"name\":" + quote(name) + ","
                + "\"encounters\":" + stringArrayJson(encounters) + ","
                + "\"source\":" + quote(source)
                + (rate >= 0 ? ",\"rate\":" + rate : "")
                + "}";
    }

    private static String gymRouteEntry(String id, String group, String label) {
        return "{"
                + "\"type\":\"gym\","
                + "\"name\":" + quote(label) + ","
                + "\"value\":" + quote(id) + ","
                + "\"group\":" + quote(group) + ","
                + "\"boss\":" + quote(label) + ","
                + "\"source\":\"upr-zx-trainer\""
                + "}";
    }

    private static List<String> pokemonNames(List<Pokemon> pokemon) {
        List<String> names = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        if (pokemon == null) {
            return names;
        }
        for (Pokemon pkmn : pokemon) {
            String name = pokemonSlug(pkmn, "");
            if (!name.isEmpty() && seen.add(name)) {
                names.add(name);
            }
        }
        return names;
    }

    private static String trainerLabel(Trainer trainer) {
        if (trainer.fullDisplayName != null && !trainer.fullDisplayName.trim().isEmpty()) {
            return trainer.fullDisplayName.trim();
        }
        if (trainer.name != null && !trainer.name.trim().isEmpty()) {
            return trainer.name.trim();
        }
        if (trainer.tag != null && !trainer.tag.trim().isEmpty()) {
            return titleCaseTag(trainer.tag);
        }
        return "Trainer " + trainer.index;
    }

    private static String trainerGroup(Trainer trainer) {
        String tag = trainer.tag == null ? "" : trainer.tag.toUpperCase();
        if (tag.startsWith("RIVAL") || tag.startsWith("FRIEND")) {
            return "rival";
        }
        if (tag.startsWith("ELITE") || tag.startsWith("CHAMPION")) {
            return "elite-four";
        }
        if (tag.contains("TEAM") || tag.contains("THEMED") || tag.contains("UBER")) {
            return "evil-team";
        }
        if (trainer.isBoss()) {
            return "gym-leader";
        }
        return "boss";
    }

    private static String statsJson(Pokemon pokemon) {
        return "{"
                + "\"hp\":" + pokemon.hp + ","
                + "\"atk\":" + pokemon.attack + ","
                + "\"def\":" + pokemon.defense + ","
                + "\"spa\":" + pokemon.spatk + ","
                + "\"spd\":" + pokemon.spdef + ","
                + "\"spe\":" + pokemon.speed
                + "}";
    }

    private static String typeArrayJson(Pokemon pokemon) {
        List<String> types = new ArrayList<>();
        if (pokemon.primaryType != null) {
            types.add(typeSlug(pokemon.primaryType));
        }
        if (pokemon.secondaryType != null && pokemon.secondaryType != pokemon.primaryType) {
            types.add(typeSlug(pokemon.secondaryType));
        }
        if (types.isEmpty()) {
            types.add("normal");
        }
        return stringArrayJson(types);
    }

    private static String typeSlug(Type type) {
        return type == null ? "normal" : type.toString().toLowerCase().replace('_', '-');
    }

    private static String moveCategorySlug(MoveCategory category) {
        return category == null ? "status" : category.toString().toLowerCase();
    }

    private static String pokemonSlug(Pokemon pokemon, String formeSuffix) {
        if (pokemon == null || pokemon.name == null) {
            return "";
        }
        String suffix = formeSuffix == null || formeSuffix.isEmpty() ? pokemon.formeSuffix : formeSuffix;
        return slug(pokemon.name + (suffix == null ? "" : suffix));
    }

    private static String slug(String value) {
        if (value == null) {
            return "";
        }
        String lower = value.toLowerCase()
                .replace("\u2640", "-f")
                .replace("\u2642", "-m")
                .replace("'", "")
                .replace("\u2019", "");
        StringBuilder out = new StringBuilder();
        boolean lastDash = false;
        for (int i = 0; i < lower.length(); i++) {
            char ch = lower.charAt(i);
            boolean alnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
            if (alnum) {
                out.append(ch);
                lastDash = false;
            } else if (!lastDash) {
                out.append('-');
                lastDash = true;
            }
        }
        while (out.length() > 0 && out.charAt(0) == '-') {
            out.deleteCharAt(0);
        }
        while (out.length() > 0 && out.charAt(out.length() - 1) == '-') {
            out.deleteCharAt(out.length() - 1);
        }
        return out.toString();
    }

    private static String titleCaseTag(String tag) {
        String spaced = tag.toLowerCase().replace('-', ' ').replace('_', ' ');
        StringBuilder out = new StringBuilder();
        boolean nextUpper = true;
        for (int i = 0; i < spaced.length(); i++) {
            char ch = spaced.charAt(i);
            if (Character.isWhitespace(ch)) {
                out.append(ch);
                nextUpper = true;
            } else if (nextUpper) {
                out.append(Character.toUpperCase(ch));
                nextUpper = false;
            } else {
                out.append(ch);
            }
        }
        return out.toString();
    }

    private static String warningJson(String code, Exception error) {
        return "{"
                + "\"code\":" + quote(code) + ","
                + "\"message\":" + quote(error.getMessage() == null ? error.getClass().getName() : error.getMessage())
                + "}";
    }

    private static String stringArrayJson(List<String> values) {
        List<String> quoted = new ArrayList<>();
        for (String value : values) {
            quoted.add(quote(value));
        }
        return "[" + join(quoted) + "]";
    }

    private static String join(List<String> values) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                out.append(',');
            }
            out.append(values.get(i));
        }
        return out.toString();
    }

    private static String quote(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            switch (ch) {
                case '\\':
                    out.append("\\\\");
                    break;
                case '"':
                    out.append("\\\"");
                    break;
                case '\n':
                    out.append("\\n");
                    break;
                case '\r':
                    out.append("\\r");
                    break;
                case '\t':
                    out.append("\\t");
                    break;
                default:
                    if (ch < 0x20) {
                        String hex = Integer.toHexString(ch);
                        out.append("\\u");
                        for (int j = hex.length(); j < 4; j++) {
                            out.append('0');
                        }
                        out.append(hex);
                    } else {
                        out.append(ch);
                    }
                    break;
            }
        }
        out.append('"');
        return out.toString();
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
        public final boolean clean;
        public final String settingsSchemaJson;
        public final String diagnosticsJson;

        private RomInspection(
                boolean supported,
                String sourceRomPath,
                String name,
                String code,
                String supportLevel,
                String defaultExtension,
                int generation,
                boolean nintendo3ds,
                boolean nintendoDs,
                boolean clean,
                String settingsSchemaJson,
                String diagnosticsJson
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
            this.clean = clean;
            this.settingsSchemaJson = settingsSchemaJson;
            this.diagnosticsJson = diagnosticsJson;
        }

        private static RomInspection unsupported(String sourceRomPath, String diagnosticsJson) {
            return new RomInspection(false, sourceRomPath, null, null, null, null, 0, false, false, false, null, diagnosticsJson);
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
        public final String extractedDataJson;
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
                String extractedDataJson,
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
            this.extractedDataJson = extractedDataJson;
            this.log = log;
        }

        private static RandomizerResponse ok(
                int checkValue,
                String outputPath,
                String engineVersion,
                String settingsString,
                boolean changedStarter,
                boolean removedCodeTweaks,
                String extractedDataJson,
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
                    extractedDataJson,
                    logString(logBytes)
            );
        }

        private static RandomizerResponse error(String error, ByteArrayOutputStream logBytes) {
            return new RandomizerResponse(false, error, 0, null, null, null, false, false, null, logString(logBytes));
        }

        private static String logString(ByteArrayOutputStream logBytes) {
            return logBytes.toString(StandardCharsets.UTF_8);
        }
    }
}
