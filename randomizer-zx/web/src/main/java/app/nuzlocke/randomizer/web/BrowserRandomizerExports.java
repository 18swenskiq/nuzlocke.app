package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.io.RandomizerVfs;
import org.teavm.jso.JSExport;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class BrowserRandomizerExports {
    private BrowserRandomizerExports() {
    }

    public static void installBrowserVfs() {
        RandomizerVfs.set(new BrowserVfsFileSystem());
    }

    public static long vfsLength(String path) {
        try {
            return RandomizerVfs.get().length(path);
        } catch (Exception e) {
            return 0;
        }
    }

    @JSExport
    public static String defaultSettingsString() {
        return new Settings().toString();
    }

    @JSExport
    public static String settingsStringFromUi(String settingsJson) {
        try {
            Settings settings = settingsFromUiJson(settingsJson);
            return "{"
                    + "\"ok\":true,"
                    + "\"settingsString\":" + quote(settings.toString())
                    + "}";
        } catch (Exception e) {
            return errorJson(e);
        }
    }

    @JSExport
    public static String inspectRom(String sourceRomPath) {
        installBrowserVfs();
        try {
            BrowserRandomizerAdapter.RomInspection inspection =
                    BrowserRandomizerAdapter.inspectRom(sourceRomPath);
            return inspectionJson(inspection);
        } catch (Exception e) {
            return errorJson(e);
        }
    }

    @JSExport
    public static String randomize(
            String sourceRomPath,
            String updatePath,
            String outputPath,
            String settingsString,
            long seed,
            boolean saveAsDirectory
    ) {
        installBrowserVfs();
        BrowserRandomizerAdapter.RandomizerRequest request =
                new BrowserRandomizerAdapter.RandomizerRequest(
                        sourceRomPath,
                        blankToNull(updatePath),
                        outputPath,
                        settingsString == null || settingsString.isEmpty()
                                ? defaultSettingsString()
                                : settingsString,
                        seed,
                        saveAsDirectory
                );
        return responseJson(BrowserRandomizerAdapter.randomize(request));
    }

    private static String blankToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }

    private static Settings settingsFromUiJson(String settingsJson) {
        Settings settings = new Settings();

        String baseStats = jsonValue(settingsJson, "baseStats", "unchanged");
        settings.setBaseStatisticsMod(
                "unchanged".equals(baseStats),
                "shuffle".equals(baseStats),
                "random".equals(baseStats) || "random-total".equals(baseStats)
        );
        settings.setAssignEvoStatsRandomly("random-total".equals(baseStats));

        String types = jsonValue(settingsJson, "types", "unchanged");
        settings.setTypesMod(
                "unchanged".equals(types),
                "random-follow-evolutions".equals(types),
                "random-completely".equals(types)
        );

        String abilities = jsonValue(settingsJson, "abilities", "unchanged");
        settings.setAbilitiesMod("unchanged".equals(abilities), !"unchanged".equals(abilities));
        settings.setAbilitiesFollowEvolutions("random-follow-evolutions".equals(abilities));

        String evolutions = jsonValue(settingsJson, "evolutions", "unchanged");
        settings.setEvolutionsMod(
                "unchanged".equals(evolutions),
                "random-same-stage".equals(evolutions) || "random-any".equals(evolutions),
                false
        );
        settings.setEvosSimilarStrength("random-same-stage".equals(evolutions));
        settings.setEvosMaxThreeStages("random-same-stage".equals(evolutions));

        String starters = jsonValue(settingsJson, "starters", "unchanged");
        if ("custom".equals(starters)) {
            throw new IllegalArgumentException("Custom starters are not wired in the browser settings mapper yet.");
        }
        settings.setStartersMod(
                "unchanged".equals(starters),
                false,
                "random-any".equals(starters),
                "random-basic".equals(starters)
        );

        String wildPokemon = jsonValue(settingsJson, "wildPokemon", "unchanged");
        settings.setWildPokemonMod(
                "unchanged".equals(wildPokemon),
                "completely-random".equals(wildPokemon),
                "area-1-to-1".equals(wildPokemon),
                "global-1-to-1".equals(wildPokemon)
        );

        String staticPokemon = jsonValue(settingsJson, "staticPokemon", "unchanged");
        settings.setStaticPokemonMod(
                "unchanged".equals(staticPokemon),
                "random-legendary-match".equals(staticPokemon),
                "random".equals(staticPokemon),
                false
        );

        String trainerPokemon = jsonValue(settingsJson, "trainerPokemon", "unchanged");
        settings.setTrainersMod(
                "unchanged".equals(trainerPokemon),
                "random".equals(trainerPokemon) || "rival-carries-starter".equals(trainerPokemon),
                false,
                false,
                "type-themed".equals(trainerPokemon),
                false
        );
        settings.setRivalCarriesStarterThroughout("rival-carries-starter".equals(trainerPokemon));

        String trainerLevels = jsonValue(settingsJson, "trainerLevels", "unchanged");
        settings.setTrainersUsePokemonOfSimilarStrength("unchanged-with-bst".equals(trainerLevels));
        if ("level-modifier".equals(trainerLevels)) {
            settings.setTrainersLevelModified(true);
            settings.setTrainersLevelModifier(0);
        }

        String movesets = jsonValue(settingsJson, "movesets", "unchanged");
        settings.setMovesetsMod(
                "unchanged".equals(movesets),
                "random-preferring-type".equals(movesets),
                "random-completely".equals(movesets),
                false
        );

        String tms = jsonValue(settingsJson, "tms", "unchanged");
        settings.setTmsMod("unchanged".equals(tms), !"unchanged".equals(tms));
        settings.setTmsHmsCompatibilityMod(
                !"random-compatible".equals(tms),
                "random-compatible".equals(tms),
                false,
                false
        );

        String fieldItems = jsonValue(settingsJson, "fieldItems", "unchanged");
        settings.setFieldItemsMod(
                "unchanged".equals(fieldItems),
                "shuffle".equals(fieldItems),
                "random".equals(fieldItems),
                false
        );

        return settings;
    }

    private static String jsonValue(String json, String key, String defaultValue) {
        if (json == null || json.isEmpty()) {
            return defaultValue;
        }
        Pattern pattern = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
        Matcher matcher = pattern.matcher(json);
        return matcher.find() ? unescapeJsonString(matcher.group(1)) : defaultValue;
    }

    private static String unescapeJsonString(String value) {
        StringBuilder out = new StringBuilder();
        boolean escaped = false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (escaped) {
                switch (ch) {
                    case '"':
                    case '\\':
                    case '/':
                        out.append(ch);
                        break;
                    case 'b':
                        out.append('\b');
                        break;
                    case 'f':
                        out.append('\f');
                        break;
                    case 'n':
                        out.append('\n');
                        break;
                    case 'r':
                        out.append('\r');
                        break;
                    case 't':
                        out.append('\t');
                        break;
                    default:
                        out.append(ch);
                        break;
                }
                escaped = false;
            } else if (ch == '\\') {
                escaped = true;
            } else {
                out.append(ch);
            }
        }
        return out.toString();
    }

    private static String inspectionJson(BrowserRandomizerAdapter.RomInspection inspection) {
        return "{"
                + "\"ok\":true,"
                + "\"supported\":" + inspection.supported + ","
                + "\"sourceRomPath\":" + quote(inspection.sourceRomPath) + ","
                + "\"name\":" + quote(inspection.name) + ","
                + "\"code\":" + quote(inspection.code) + ","
                + "\"supportLevel\":" + quote(inspection.supportLevel) + ","
                + "\"defaultExtension\":" + quote(inspection.defaultExtension) + ","
                + "\"generation\":" + inspection.generation + ","
                + "\"nintendo3ds\":" + inspection.nintendo3ds + ","
                + "\"nintendoDs\":" + inspection.nintendoDs
                + "}";
    }

    private static String responseJson(BrowserRandomizerAdapter.RandomizerResponse response) {
        return "{"
                + "\"ok\":" + response.ok + ","
                + "\"error\":" + quote(response.error) + ","
                + "\"checkValue\":" + response.checkValue + ","
                + "\"outputPath\":" + quote(response.outputPath) + ","
                + "\"engineVersion\":" + quote(response.engineVersion) + ","
                + "\"settingsString\":" + quote(response.settingsString) + ","
                + "\"changedStarter\":" + response.changedStarter + ","
                + "\"removedCodeTweaks\":" + response.removedCodeTweaks + ","
                + "\"extractedData\":" + (response.extractedDataJson == null ? "null" : response.extractedDataJson) + ","
                + "\"log\":" + quote(response.log)
                + "}";
    }

    private static String errorJson(Exception error) {
        return "{"
                + "\"ok\":false,"
                + "\"error\":" + quote(error.getMessage()) + ","
                + "\"exception\":" + quote(error.getClass().getName())
                + "}";
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
}
