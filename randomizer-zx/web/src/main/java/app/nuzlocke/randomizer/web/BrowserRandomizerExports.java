package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.MiscTweak;
import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.io.RandomizerVfs;
import com.dabomstew.pkrandom.pokemon.ExpCurve;
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
        Settings settings = new Settings();
        finalizeSettings(settings, "");
        return settings.toString();
    }

    @JSExport
    public static String settingsStringFromUi(String settingsJson) {
        try {
            Settings settings = settingsFromUiJson(settingsJson);
            finalizeSettings(settings, settingsJson);
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
    public static String settingsSchema(String sourceRomPath) {
        installBrowserVfs();
        try {
            BrowserRandomizerAdapter.RomInspection inspection =
                    BrowserRandomizerAdapter.inspectRom(sourceRomPath);
            if (!inspection.supported) {
                return "{"
                        + "\"ok\":false,"
                        + "\"error\":\"Unsupported ROM\""
                        + "}";
            }
            return "{"
                    + "\"ok\":true,"
                    + "\"schema\":" + inspection.settingsSchemaJson
                    + "}";
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

        settings.setLimitPokemon(jsonBoolean(settingsJson, "limitPokemon", false));
        settings.setBanIrregularAltFormes(jsonBoolean(settingsJson, "banIrregularAltFormes", false));
        settings.setRaceMode(jsonBoolean(settingsJson, "raceMode", false));
        settings.setChangeImpossibleEvolutions(jsonBoolean(settingsJson, "changeImpossibleEvolutions", false));
        settings.setMakeEvolutionsEasier(jsonBoolean(settingsJson, "makeEvolutionsEasier", false));
        settings.setRemoveTimeBasedEvolutions(jsonBoolean(settingsJson, "removeTimeBasedEvolutions", false));

        String baseStats = jsonValue(settingsJson, "baseStats", "unchanged");
        settings.setBaseStatisticsMod(
                "unchanged".equals(baseStats),
                "shuffle".equals(baseStats),
                "random".equals(baseStats) || "random-total".equals(baseStats)
        );
        settings.setBaseStatsFollowEvolutions(jsonBoolean(settingsJson, "baseStatsFollowEvolutions", false));
        settings.setBaseStatsFollowMegaEvolutions(jsonBoolean(settingsJson, "baseStatsFollowMegaEvolutions", false));
        settings.setAssignEvoStatsRandomly("random-total".equals(baseStats)
                || jsonBoolean(settingsJson, "assignEvoStatsRandomly", false));
        settings.setStandardizeEXPCurves(jsonBoolean(settingsJson, "standardizeEXPCurves", false));

        String expCurveMod = jsonValue(settingsJson, "expCurveMod", "legendaries");
        settings.setExpCurveMod(
                "legendaries".equals(expCurveMod),
                "strong-legendaries".equals(expCurveMod),
                "all".equals(expCurveMod)
        );
        ExpCurve expCurve = expCurveFromName(jsonValue(settingsJson, "selectedEXPCurve", ""));
        if (expCurve != null) {
            settings.setSelectedEXPCurve(expCurve);
        }
        settings.setUpdateBaseStats(jsonBoolean(settingsJson, "updateBaseStats", false));
        settings.setUpdateBaseStatsToGeneration(jsonInt(settingsJson, "updateBaseStatsToGeneration", 0));

        String types = jsonValue(settingsJson, "types", "unchanged");
        settings.setTypesMod(
                "unchanged".equals(types),
                "random-follow-evolutions".equals(types),
                "random-completely".equals(types)
        );
        settings.setTypesFollowMegaEvolutions(jsonBoolean(settingsJson, "typesFollowMegaEvolutions", false));
        settings.setDualTypeOnly(jsonBoolean(settingsJson, "dualTypeOnly", false));

        String abilities = jsonValue(settingsJson, "abilities", "unchanged");
        settings.setAbilitiesMod("unchanged".equals(abilities), !"unchanged".equals(abilities));
        settings.setAbilitiesFollowEvolutions("random-follow-evolutions".equals(abilities));
        settings.setAllowWonderGuard(jsonBoolean(settingsJson, "allowWonderGuard", true));
        settings.setAbilitiesFollowMegaEvolutions(jsonBoolean(settingsJson, "abilitiesFollowMegaEvolutions", false));
        settings.setBanTrappingAbilities(jsonBoolean(settingsJson, "banTrappingAbilities", false));
        settings.setBanNegativeAbilities(jsonBoolean(settingsJson, "banNegativeAbilities", false));
        settings.setBanBadAbilities(jsonBoolean(settingsJson, "banBadAbilities", false));
        settings.setWeighDuplicateAbilitiesTogether(jsonBoolean(settingsJson, "weighDuplicateAbilitiesTogether", false));
        settings.setEnsureTwoAbilities(jsonBoolean(settingsJson, "ensureTwoAbilities", false));

        String evolutions = jsonValue(settingsJson, "evolutions", "unchanged");
        settings.setEvolutionsMod(
                "unchanged".equals(evolutions),
                "random-same-stage".equals(evolutions) || "random-any".equals(evolutions),
                "random-every-level".equals(evolutions)
        );
        settings.setEvosSimilarStrength("random-same-stage".equals(evolutions));
        settings.setEvosSameTyping(jsonBoolean(settingsJson, "evosSameTyping", false));
        settings.setEvosMaxThreeStages("random-same-stage".equals(evolutions)
                || jsonBoolean(settingsJson, "evosMaxThreeStages", false));
        settings.setEvosForceChange(jsonBoolean(settingsJson, "evosForceChange", false));
        settings.setEvosAllowAltFormes(jsonBoolean(settingsJson, "evosAllowAltFormes", false));

        String starters = jsonValue(settingsJson, "starters", "unchanged");
        settings.setStartersMod(
                "unchanged".equals(starters),
                "custom".equals(starters),
                "random-any".equals(starters),
                "random-basic".equals(starters)
        );
        int[] customStarters = new int[] {
                jsonInt(settingsJson, "customStarter1", 0),
                jsonInt(settingsJson, "customStarter2", 0),
                jsonInt(settingsJson, "customStarter3", 0)
        };
        if ("custom".equals(starters)
                && (customStarters[0] <= 0 || customStarters[1] <= 0 || customStarters[2] <= 0)) {
            throw new IllegalArgumentException("Choose all three custom starters before randomizing.");
        }
        settings.setCustomStarters(customStarters);
        settings.setRandomizeStartersHeldItems(jsonBoolean(settingsJson, "randomizeStartersHeldItems", false));
        settings.setBanBadRandomStarterHeldItems(jsonBoolean(settingsJson, "banBadRandomStarterHeldItems", false));
        settings.setAllowStarterAltFormes(jsonBoolean(settingsJson, "allowStarterAltFormes", false));

        String staticPokemon = jsonValue(settingsJson, "staticPokemon", "unchanged");
        settings.setStaticPokemonMod(
                "unchanged".equals(staticPokemon),
                "random-legendary-match".equals(staticPokemon),
                "random".equals(staticPokemon),
                "similar-strength".equals(staticPokemon)
        );
        settings.setLimitMainGameLegendaries(jsonBoolean(settingsJson, "limitMainGameLegendaries", false));
        settings.setLimit600(jsonBoolean(settingsJson, "limit600", false));
        settings.setAllowStaticAltFormes(jsonBoolean(settingsJson, "allowStaticAltFormes", false));
        settings.setSwapStaticMegaEvos(jsonBoolean(settingsJson, "swapStaticMegaEvos", false));
        settings.setStaticLevelModified(jsonBoolean(settingsJson, "staticLevelModified", false));
        settings.setStaticLevelModifier(jsonInt(settingsJson, "staticLevelModifier", 0));
        settings.setCorrectStaticMusic(jsonBoolean(settingsJson, "correctStaticMusic", false));

        String inGameTrades = jsonValue(settingsJson, "inGameTrades", "unchanged");
        settings.setInGameTradesMod(
                "unchanged".equals(inGameTrades),
                "randomize-given".equals(inGameTrades),
                "randomize-given-and-requested".equals(inGameTrades)
        );
        settings.setRandomizeInGameTradesNicknames(jsonBoolean(settingsJson, "randomizeInGameTradesNicknames", false));
        settings.setRandomizeInGameTradesOTs(jsonBoolean(settingsJson, "randomizeInGameTradesOTs", false));
        settings.setRandomizeInGameTradesIVs(jsonBoolean(settingsJson, "randomizeInGameTradesIVs", false));
        settings.setRandomizeInGameTradesItems(jsonBoolean(settingsJson, "randomizeInGameTradesItems", false));

        String totemPokemon = jsonValue(settingsJson, "totemPokemon", "unchanged");
        settings.setTotemPokemonMod(
                "unchanged".equals(totemPokemon),
                "random".equals(totemPokemon),
                "similar-strength".equals(totemPokemon)
        );
        String allyPokemon = jsonValue(settingsJson, "allyPokemon", "unchanged");
        settings.setAllyPokemonMod(
                "unchanged".equals(allyPokemon),
                "random".equals(allyPokemon),
                "similar-strength".equals(allyPokemon)
        );
        String aura = jsonValue(settingsJson, "aura", "unchanged");
        settings.setAuraMod(
                "unchanged".equals(aura),
                "random".equals(aura),
                "same-strength".equals(aura)
        );
        settings.setRandomizeTotemHeldItems(jsonBoolean(settingsJson, "randomizeTotemHeldItems", false));
        settings.setTotemLevelsModified(jsonBoolean(settingsJson, "totemLevelsModified", false));
        settings.setTotemLevelModifier(jsonInt(settingsJson, "totemLevelModifier", 0));
        settings.setAllowTotemAltFormes(jsonBoolean(settingsJson, "allowTotemAltFormes", false));

        settings.setRandomizeMovePowers(jsonBoolean(settingsJson, "randomizeMovePowers", false));
        settings.setRandomizeMoveAccuracies(jsonBoolean(settingsJson, "randomizeMoveAccuracies", false));
        settings.setRandomizeMovePPs(jsonBoolean(settingsJson, "randomizeMovePPs", false));
        settings.setRandomizeMoveTypes(jsonBoolean(settingsJson, "randomizeMoveTypes", false));
        settings.setRandomizeMoveCategory(jsonBoolean(settingsJson, "randomizeMoveCategory", false));
        settings.setUpdateMoves(jsonBoolean(settingsJson, "updateMoves", false));
        settings.setUpdateMovesToGeneration(jsonInt(settingsJson, "updateMovesToGeneration", 0));

        String movesets = jsonValue(settingsJson, "movesets", "unchanged");
        settings.setMovesetsMod(
                "unchanged".equals(movesets),
                "random-preferring-type".equals(movesets),
                "random-completely".equals(movesets),
                "metronome-only".equals(movesets)
        );
        settings.setStartWithGuaranteedMoves(jsonBoolean(settingsJson, "startWithGuaranteedMoves", false));
        settings.setGuaranteedMoveCount(jsonInt(settingsJson, "guaranteedMoveCount", 2));
        settings.setReorderDamagingMoves(jsonBoolean(settingsJson, "reorderDamagingMoves", false));
        settings.setMovesetsForceGoodDamaging(jsonBoolean(settingsJson, "movesetsForceGoodDamaging", false));
        settings.setMovesetsGoodDamagingPercent(jsonInt(settingsJson, "movesetsGoodDamagingPercent", 0));
        settings.setBlockBrokenMovesetMoves(jsonBoolean(settingsJson, "blockBrokenMovesetMoves", false));
        settings.setEvolutionMovesForAll(jsonBoolean(settingsJson, "evolutionMovesForAll", false));

        String trainerPokemon = jsonValue(settingsJson, "trainerPokemon", "unchanged");
        settings.setTrainersMod(
                "unchanged".equals(trainerPokemon),
                "random".equals(trainerPokemon) || "rival-carries-starter".equals(trainerPokemon),
                "distributed".equals(trainerPokemon),
                "main-playthrough".equals(trainerPokemon),
                "type-themed".equals(trainerPokemon),
                "type-themed-elite4-gyms".equals(trainerPokemon)
        );
        settings.setTrainersEnforceDistribution("distributed".equals(trainerPokemon));
        settings.setTrainersEnforceMainPlaythrough("main-playthrough".equals(trainerPokemon));
        settings.setRivalCarriesStarterThroughout("rival-carries-starter".equals(trainerPokemon)
                || jsonBoolean(settingsJson, "rivalCarriesStarter", false));
        settings.setTrainersUsePokemonOfSimilarStrength(jsonBoolean(settingsJson, "trainersUsePokemonOfSimilarStrength", false));
        settings.setTrainersMatchTypingDistribution(jsonBoolean(settingsJson, "trainersMatchTypingDistribution", false));
        settings.setTrainersBlockLegendaries(jsonBoolean(settingsJson, "trainersBlockLegendaries", true));
        settings.setTrainersBlockEarlyWonderGuard(jsonBoolean(settingsJson, "trainersBlockEarlyWonderGuard", true));
        settings.setRandomizeTrainerNames(jsonBoolean(settingsJson, "randomizeTrainerNames", false));
        settings.setRandomizeTrainerClassNames(jsonBoolean(settingsJson, "randomizeTrainerClassNames", false));
        settings.setTrainersForceFullyEvolved(jsonBoolean(settingsJson, "trainersForceFullyEvolved", false));
        settings.setTrainersForceFullyEvolvedLevel(jsonInt(settingsJson, "trainersForceFullyEvolvedLevel", 30));
        settings.setTrainersLevelModified(jsonBoolean(settingsJson, "trainersLevelModified", false));
        settings.setTrainersLevelModifier(jsonInt(settingsJson, "trainerLevelModifier", 0));
        settings.setEliteFourUniquePokemonNumber(jsonInt(settingsJson, "eliteFourUniquePokemonNumber", 0));
        settings.setAllowTrainerAlternateFormes(jsonBoolean(settingsJson, "allowTrainerAlternateFormes", false));
        settings.setSwapTrainerMegaEvos(jsonBoolean(settingsJson, "swapTrainerMegaEvos", false));
        settings.setAdditionalBossTrainerPokemon(jsonInt(settingsJson, "additionalBossTrainerPokemon", 0));
        settings.setAdditionalImportantTrainerPokemon(jsonInt(settingsJson, "additionalImportantTrainerPokemon", 0));
        settings.setAdditionalRegularTrainerPokemon(jsonInt(settingsJson, "additionalRegularTrainerPokemon", 0));
        settings.setRandomizeHeldItemsForBossTrainerPokemon(jsonBoolean(settingsJson, "randomizeHeldItemsForBossTrainerPokemon", false));
        settings.setRandomizeHeldItemsForImportantTrainerPokemon(jsonBoolean(settingsJson, "randomizeHeldItemsForImportantTrainerPokemon", false));
        settings.setRandomizeHeldItemsForRegularTrainerPokemon(jsonBoolean(settingsJson, "randomizeHeldItemsForRegularTrainerPokemon", false));
        settings.setConsumableItemsOnlyForTrainers(jsonBoolean(settingsJson, "consumableItemsOnlyForTrainers", false));
        settings.setSensibleItemsOnlyForTrainers(jsonBoolean(settingsJson, "sensibleItemsOnlyForTrainers", false));
        settings.setHighestLevelGetsItemsForTrainers(jsonBoolean(settingsJson, "highestLevelGetsItemsForTrainers", false));
        settings.setDoubleBattleMode(jsonBoolean(settingsJson, "doubleBattleMode", false));
        settings.setShinyChance(jsonBoolean(settingsJson, "shinyChance", false));
        settings.setBetterTrainerMovesets(jsonBoolean(settingsJson, "betterTrainerMovesets", false));

        String trainerLevels = jsonValue(settingsJson, "trainerLevels", "unchanged");
        if ("unchanged-with-bst".equals(trainerLevels)) {
            settings.setTrainersUsePokemonOfSimilarStrength(true);
        }
        if ("level-modifier".equals(trainerLevels)) {
            settings.setTrainersLevelModified(true);
            settings.setTrainersLevelModifier(0);
        }

        String wildPokemon = jsonValue(settingsJson, "wildPokemon", "unchanged");
        settings.setWildPokemonMod(
                "unchanged".equals(wildPokemon),
                "completely-random".equals(wildPokemon),
                "area-1-to-1".equals(wildPokemon),
                "global-1-to-1".equals(wildPokemon)
        );
        String wildRestriction = jsonValue(settingsJson, "wildPokemonRestriction", "none");
        settings.setWildPokemonRestrictionMod(
                "none".equals(wildRestriction),
                "similar-strength".equals(wildRestriction),
                "catch-em-all".equals(wildRestriction),
                "type-theme-areas".equals(wildRestriction)
        );
        settings.setUseTimeBasedEncounters(jsonBoolean(settingsJson, "useTimeBasedEncounters", false));
        settings.setUseMinimumCatchRate(jsonBoolean(settingsJson, "useMinimumCatchRate", false));
        settings.setMinimumCatchRateLevel(jsonInt(settingsJson, "minimumCatchRateLevel", 1));
        settings.setBlockWildLegendaries(jsonBoolean(settingsJson, "blockWildLegendaries", true));
        settings.setRandomizeWildPokemonHeldItems(jsonBoolean(settingsJson, "randomizeWildPokemonHeldItems", false));
        settings.setBanBadRandomWildPokemonHeldItems(jsonBoolean(settingsJson, "banBadRandomWildPokemonHeldItems", false));
        settings.setBalanceShakingGrass(jsonBoolean(settingsJson, "balanceShakingGrass", false));
        settings.setWildLevelsModified(jsonBoolean(settingsJson, "wildLevelsModified", false));
        settings.setWildLevelModifier(jsonInt(settingsJson, "wildLevelModifier", 0));
        settings.setAllowWildAltFormes(jsonBoolean(settingsJson, "allowWildAltFormes", false));

        String tms = jsonValue(settingsJson, "tms", "unchanged");
        settings.setTmsMod("unchanged".equals(tms), !"unchanged".equals(tms));
        settings.setTmLevelUpMoveSanity(jsonBoolean(settingsJson, "tmLevelUpMoveSanity", false));
        settings.setKeepFieldMoveTMs(jsonBoolean(settingsJson, "keepFieldMoveTMs", false));
        settings.setFullHMCompat(jsonBoolean(settingsJson, "fullHMCompat", false));
        settings.setTmsForceGoodDamaging(jsonBoolean(settingsJson, "tmsForceGoodDamaging", false));
        settings.setTmsGoodDamagingPercent(jsonInt(settingsJson, "tmsGoodDamagingPercent", 0));
        settings.setBlockBrokenTMMoves(jsonBoolean(settingsJson, "blockBrokenTMMoves", false));
        String tmHmCompatibility = jsonValue(settingsJson, "tmHmCompatibility",
                "random-compatible".equals(tms) ? "random-prefer-type" : "unchanged");
        settings.setTmsHmsCompatibilityMod(
                "unchanged".equals(tmHmCompatibility),
                "random-prefer-type".equals(tmHmCompatibility),
                "random-completely".equals(tmHmCompatibility),
                "full".equals(tmHmCompatibility)
        );
        settings.setTmsFollowEvolutions(jsonBoolean(settingsJson, "tmsFollowEvolutions", false));

        String moveTutorMoves = jsonValue(settingsJson, "moveTutorMoves", "unchanged");
        settings.setMoveTutorMovesMod("unchanged".equals(moveTutorMoves), "random".equals(moveTutorMoves));
        settings.setTutorLevelUpMoveSanity(jsonBoolean(settingsJson, "tutorLevelUpMoveSanity", false));
        settings.setKeepFieldMoveTutors(jsonBoolean(settingsJson, "keepFieldMoveTutors", false));
        settings.setTutorsForceGoodDamaging(jsonBoolean(settingsJson, "tutorsForceGoodDamaging", false));
        settings.setTutorsGoodDamagingPercent(jsonInt(settingsJson, "tutorsGoodDamagingPercent", 0));
        settings.setBlockBrokenTutorMoves(jsonBoolean(settingsJson, "blockBrokenTutorMoves", false));
        String moveTutorCompatibility = jsonValue(settingsJson, "moveTutorCompatibility", "unchanged");
        settings.setMoveTutorsCompatibilityMod(
                "unchanged".equals(moveTutorCompatibility),
                "random-prefer-type".equals(moveTutorCompatibility),
                "random-completely".equals(moveTutorCompatibility),
                "full".equals(moveTutorCompatibility)
        );
        settings.setTutorFollowEvolutions(jsonBoolean(settingsJson, "tutorFollowEvolutions", false));

        String fieldItems = jsonValue(settingsJson, "fieldItems", "unchanged");
        settings.setFieldItemsMod(
                "unchanged".equals(fieldItems),
                "shuffle".equals(fieldItems),
                "random".equals(fieldItems),
                "random-even".equals(fieldItems)
        );
        settings.setBanBadRandomFieldItems(jsonBoolean(settingsJson, "banBadRandomFieldItems", false));

        String shopItems = jsonValue(settingsJson, "shopItems", "unchanged");
        settings.setShopItemsMod(
                "unchanged".equals(shopItems),
                "shuffle".equals(shopItems),
                "random".equals(shopItems)
        );
        settings.setBanBadRandomShopItems(jsonBoolean(settingsJson, "banBadRandomShopItems", false));
        settings.setBanRegularShopItems(jsonBoolean(settingsJson, "banRegularShopItems", false));
        settings.setBanOPShopItems(jsonBoolean(settingsJson, "banOPShopItems", false));
        settings.setBalanceShopPrices(jsonBoolean(settingsJson, "balanceShopPrices", false));
        settings.setGuaranteeEvolutionItems(jsonBoolean(settingsJson, "guaranteeEvolutionItems", false));
        settings.setGuaranteeXItems(jsonBoolean(settingsJson, "guaranteeXItems", false));

        String pickupItems = jsonValue(settingsJson, "pickupItems", "unchanged");
        settings.setPickupItemsMod("unchanged".equals(pickupItems), "random".equals(pickupItems));
        settings.setBanBadRandomPickupItems(jsonBoolean(settingsJson, "banBadRandomPickupItems", false));

        int miscTweaks = 0;
        for (MiscTweak tweak : MiscTweak.allTweaks) {
            if (jsonBoolean(settingsJson, "miscTweak_" + tweak.getValue(), false)) {
                miscTweaks |= tweak.getValue();
            }
        }
        settings.setCurrentMiscTweaks(miscTweaks);

        return settings;
    }

    private static void finalizeSettings(Settings settings, String settingsJson) {
        String romName = jsonValue(settingsJson, "romName", "");
        settings.setRomName(romName == null ? "" : romName);
        if (settings.getSelectedEXPCurve() == null) {
            settings.setSelectedEXPCurve(ExpCurve.MEDIUM_FAST);
        }
    }

    private static String jsonValue(String json, String key, String defaultValue) {
        if (json == null || json.isEmpty()) {
            return defaultValue;
        }
        Pattern pattern = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"])*)\"");
        Matcher matcher = pattern.matcher(json);
        return matcher.find() ? unescapeJsonString(matcher.group(1)) : defaultValue;
    }

    private static boolean jsonBoolean(String json, String key, boolean defaultValue) {
        if (json == null || json.isEmpty()) {
            return defaultValue;
        }
        Pattern boolPattern = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*(true|false)");
        Matcher boolMatcher = boolPattern.matcher(json);
        if (boolMatcher.find()) {
            return "true".equals(boolMatcher.group(1));
        }
        String stringValue = jsonValue(json, key, null);
        return stringValue == null ? defaultValue : "true".equalsIgnoreCase(stringValue);
    }

    private static int jsonInt(String json, String key, int defaultValue) {
        if (json == null || json.isEmpty()) {
            return defaultValue;
        }
        Pattern intPattern = Pattern.compile("\"" + Pattern.quote(key) + "\"\\s*:\\s*(-?\\d+)");
        Matcher intMatcher = intPattern.matcher(json);
        if (intMatcher.find()) {
            try {
                return Integer.parseInt(intMatcher.group(1));
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        String stringValue = jsonValue(json, key, null);
        if (stringValue == null || stringValue.isEmpty()) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(stringValue);
        } catch (NumberFormatException ignored) {
            return defaultValue;
        }
    }

    private static ExpCurve expCurveFromName(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        try {
            return ExpCurve.valueOf(value);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
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
                + "\"nintendoDs\":" + inspection.nintendoDs + ","
                + "\"clean\":" + inspection.clean + ","
                + "\"settingsSchema\":" + (inspection.settingsSchemaJson == null ? "null" : inspection.settingsSchemaJson)
                + ",\"diagnostics\":" + (inspection.diagnosticsJson == null ? "null" : inspection.diagnosticsJson)
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
