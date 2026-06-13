package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.FileFunctions;
import com.dabomstew.pkrandom.RandomSource;
import com.dabomstew.pkrandom.Randomizer;
import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.Version;
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
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.ResourceBundle;
import java.util.Set;

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

            Randomizer randomizer = new Randomizer(settings, romHandler, BUNDLE, saveAsDirectory);
            int checkValue = randomizer.randomize(outputPath, log, request.seed);
            String extractedDataJson = extractTrackerData(romHandler, settings);

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

    private static String extractTrackerData(RomHandler romHandler, Settings settings) {
        List<String> routeEntries = new ArrayList<>();
        List<String> leagueEntries = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        addStarterRoute(routeEntries, warnings, romHandler);
        addWildRoutes(routeEntries, warnings, romHandler, settings);
        addStaticRoute(routeEntries, warnings, romHandler);
        addImportantTrainers(routeEntries, leagueEntries, warnings, romHandler);

        String routeJson = "[" + join(routeEntries) + "]";
        String leagueJson = "{" + join(leagueEntries) + "}";
        return "{"
                + "\"route\":" + routeJson + ","
                + "\"routes\":" + routeJson + ","
                + "\"league\":" + leagueJson + ","
                + "\"trainers\":{"
                + "\"league\":" + leagueJson + ","
                + "\"importantCount\":" + leagueEntries.size()
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
            List<String> warnings,
            RomHandler romHandler
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
                + "\"name\":" + quote(trainerLabel(trainer)) + ","
                + "\"tag\":" + quote(trainer.tag) + ","
                + "\"group\":" + quote(trainerGroup(trainer)) + ","
                + "\"speciality\":\"\","
                + "\"img\":null,"
                + "\"pokemon\":[" + join(trainerPokemonJson(trainer, romHandler)) + "]"
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
