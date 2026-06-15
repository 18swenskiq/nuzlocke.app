package app.nuzlocke.randomizer.web;

import com.dabomstew.pkrandom.MiscTweak;
import com.dabomstew.pkrandom.Settings;
import com.dabomstew.pkrandom.pokemon.ExpCurve;
import com.dabomstew.pkrandom.pokemon.Pokemon;
import com.dabomstew.pkrandom.romhandlers.RomHandler;

import java.util.ArrayList;
import java.util.List;
import java.util.ResourceBundle;

public final class BrowserRandomizerSchema {
    private BrowserRandomizerSchema() {
    }

    public static String forRom(RomHandler romHandler, ResourceBundle bundle) {
        Schema schema = new Schema();
        int generation = romHandler.generationOfPokemon();

        Group general = schema.group("general", "General");
        general.checkbox("limitPokemon", "Limit Pokemon", false, true);
        general.checkbox("banIrregularAltFormes", "Ban irregular alternate formes", false, generation >= 4);
        general.checkbox("raceMode", "Race mode", false, true);
        general.checkbox("changeImpossibleEvolutions", "Change impossible evolutions", false, true);
        general.checkbox("makeEvolutionsEasier", "Make evolutions easier", false, true);
        general.checkbox("removeTimeBasedEvolutions", "Remove time-based evolutions", false, true);

        Group traits = schema.group("pokemon-traits", "Pokemon Traits");
        traits.select("baseStats", "Base stats", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("shuffle", "Shuffle"),
                choice("random", "Random"),
                choice("random-total", "Random BST"));
        traits.checkbox("baseStatsFollowEvolutions", "Follow evolutions", false, true);
        traits.checkbox("baseStatsFollowMegaEvolutions", "Follow Mega Evolutions", false, romHandler.hasMegaEvolutions());
        traits.checkbox("assignEvoStatsRandomly", "Assign evolution stats randomly", false, true);
        traits.checkbox("standardizeEXPCurves", "Standardize EXP curves", false, true);
        traits.select("expCurveMod", "EXP curve scope", "legendaries",
                choice("legendaries", "Legendary Pokemon only"),
                choice("strong-legendaries", "Strong legendary Pokemon only"),
                choice("all", "All Pokemon"));
        traits.select("selectedEXPCurve", "EXP curve", firstExpCurve(generation), expCurveChoices(generation));
        traits.checkbox("updateBaseStats", "Update base stats", false, generation < 9);
        traits.select("updateBaseStatsToGeneration", "Update base stats to", String.valueOf(Math.max(6, generation + 1)),
                generationChoices(Math.max(6, generation + 1), 9));

        traits.select("types", "Types", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("random-follow-evolutions", "Random, follow evolutions"),
                choice("random-completely", "Random completely"));
        traits.checkbox("typesFollowMegaEvolutions", "Types follow Mega Evolutions", false, romHandler.hasMegaEvolutions());
        traits.checkbox("dualTypeOnly", "Force dual types", false, true);

        if (generation >= 3) {
            traits.select("abilities", "Abilities", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("random-follow-evolutions", "Random, follow evolutions"),
                    choice("random-completely", "Random completely"));
            traits.checkbox("allowWonderGuard", "Allow Wonder Guard", true, true);
            traits.checkbox("abilitiesFollowMegaEvolutions", "Abilities follow Mega Evolutions", false, romHandler.hasMegaEvolutions());
            traits.checkbox("banTrappingAbilities", "Ban trapping abilities", false, true);
            traits.checkbox("banNegativeAbilities", "Ban negative abilities", false, true);
            traits.checkbox("banBadAbilities", "Ban bad abilities", false, true);
            traits.checkbox("weighDuplicateAbilitiesTogether", "Weigh duplicate abilities together", false, true);
            traits.checkbox("ensureTwoAbilities", "Ensure two abilities", false, true);
        }

        traits.select("evolutions", "Evolutions", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("random-same-stage", "Random, similar strength"),
                choice("random-any", "Random any Pokemon"),
                choice("random-every-level", "Random every level", generation < 3));
        traits.checkbox("evosSameTyping", "Similar typing", false, true);
        traits.checkbox("evosMaxThreeStages", "Limit to three stages", false, true);
        traits.checkbox("evosForceChange", "Force change", false, true);
        traits.checkbox("evosAllowAltFormes", "Allow alternate formes", false, generation >= 7);

        Group encounters = schema.group("encounters", "Starters, Statics & Trades");
        encounters.select("starters", "Starters", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("custom", "Custom"),
                choice("random-any", "Random completely"),
                choice("random-basic", "Random basic Pokemon with two evolutions"));
        addStarterChoices(encounters, romHandler);
        encounters.checkbox("randomizeStartersHeldItems", "Randomize starter held items", false, romHandler.supportsStarterHeldItems());
        encounters.checkbox("banBadRandomStarterHeldItems", "Ban bad starter held items", false, romHandler.supportsStarterHeldItems());
        encounters.checkbox("allowStarterAltFormes", "Allow starter alternate formes", false, romHandler.hasStarterAltFormes());

        encounters.select("staticPokemon", "Static Pokemon", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("random-legendary-match", "Swap legends and standards", !romHandler.canChangeStaticPokemon()),
                choice("random", "Random completely", !romHandler.canChangeStaticPokemon()),
                choice("similar-strength", "Similar strength", !romHandler.canChangeStaticPokemon()));
        encounters.checkbox("limitMainGameLegendaries", "Limit main-game legendaries", false,
                romHandler.canChangeStaticPokemon() && romHandler.hasMainGameLegendaries());
        encounters.checkbox("limit600", "Limit 600 BST Pokemon", false, romHandler.canChangeStaticPokemon());
        encounters.checkbox("allowStaticAltFormes", "Allow static alternate formes", false,
                romHandler.canChangeStaticPokemon() && romHandler.hasStaticAltFormes());
        encounters.checkbox("swapStaticMegaEvos", "Swap static Mega Evolutions", false,
                romHandler.canChangeStaticPokemon() && generation == 6 && !romHandler.forceSwapStaticMegaEvos());
        encounters.checkbox("staticLevelModified", "Modify static levels", false, romHandler.canChangeStaticPokemon());
        encounters.number("staticLevelModifier", "Static level modifier", 0, -50, 50, 1, romHandler.canChangeStaticPokemon());
        encounters.checkbox("correctStaticMusic", "Fix static encounter music", false,
                romHandler.canChangeStaticPokemon() && romHandler.hasStaticMusicFix());

        encounters.select("inGameTrades", "In-game trades", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("randomize-given", "Randomize given Pokemon"),
                choice("randomize-given-and-requested", "Randomize given and requested Pokemon"));
        encounters.checkbox("randomizeInGameTradesNicknames", "Randomize trade nicknames", false, true);
        encounters.checkbox("randomizeInGameTradesOTs", "Randomize trade OTs", false, generation != 1);
        encounters.checkbox("randomizeInGameTradesIVs", "Randomize trade IVs", false, generation != 1);
        encounters.checkbox("randomizeInGameTradesItems", "Randomize trade items", false, generation != 1);

        if (generation == 7) {
            Group totems = schema.group("totems", "Totem Pokemon");
            totems.select("totemPokemon", "Totem Pokemon", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("random", "Random"),
                    choice("similar-strength", "Similar strength"));
            totems.select("allyPokemon", "Ally Pokemon", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("random", "Random"),
                    choice("similar-strength", "Similar strength"));
            totems.select("aura", "Aura", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("random", "Random"),
                    choice("same-strength", "Same strength"));
            totems.checkbox("randomizeTotemHeldItems", "Randomize Totem held items", false, true);
            totems.checkbox("totemLevelsModified", "Modify Totem levels", false, true);
            totems.number("totemLevelModifier", "Totem level modifier", 0, -50, 50, 1, true);
            totems.checkbox("allowTotemAltFormes", "Allow Totem alternate formes", false, true);
        }

        Group moves = schema.group("moves", "Moves & Movesets");
        moves.checkbox("randomizeMovePowers", "Randomize move power", false, true);
        moves.checkbox("randomizeMoveAccuracies", "Randomize move accuracy", false, true);
        moves.checkbox("randomizeMovePPs", "Randomize move PP", false, true);
        moves.checkbox("randomizeMoveTypes", "Randomize move types", false, true);
        moves.checkbox("randomizeMoveCategory", "Randomize move category", false, romHandler.hasPhysicalSpecialSplit());
        moves.checkbox("updateMoves", "Update moves", false, generation < 8);
        moves.select("updateMovesToGeneration", "Update moves to", String.valueOf(generation + 1),
                generationChoices(generation + 1, 8));
        moves.select("movesets", "Movesets", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("random-preferring-type", "Random, prefer same type"),
                choice("random-completely", "Random completely"),
                choice("metronome-only", "Metronome only"));
        moves.checkbox("startWithGuaranteedMoves", "Guaranteed starting moves", false, romHandler.supportsFourStartingMoves());
        moves.number("guaranteedMoveCount", "Guaranteed move count", 2, 2, 4, 1, romHandler.supportsFourStartingMoves());
        moves.checkbox("reorderDamagingMoves", "Reorder damaging moves", false, true);
        moves.checkbox("movesetsForceGoodDamaging", "Force good damaging moves", false, true);
        moves.number("movesetsGoodDamagingPercent", "Good damaging move percent", 0, 0, 100, 5, true);
        moves.checkbox("blockBrokenMovesetMoves", "Ban game-breaking moves", false, true);
        moves.checkbox("evolutionMovesForAll", "Evolution moves for all", false, generation >= 7);

        Group trainers = schema.group("trainers", "Trainer Pokemon");
        trainers.select("trainerPokemon", "Trainer Pokemon", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("random", "Random"),
                choice("distributed", "Random, even distribution"),
                choice("main-playthrough", "Random, main-game distribution", generation != 5),
                choice("type-themed", "Type themed"),
                choice("type-themed-elite4-gyms", "Type themed bosses"));
        trainers.checkbox("rivalCarriesStarter", "Rival carries starter", false, true);
        trainers.checkbox("trainersUsePokemonOfSimilarStrength", "Similar strength", false, true);
        trainers.checkbox("trainersMatchTypingDistribution", "Match typing distribution", false, true);
        trainers.checkbox("trainersBlockLegendaries", "No legendaries", true, true);
        trainers.checkbox("trainersBlockEarlyWonderGuard", "No early Wonder Guard", true, generation >= 3);
        trainers.checkbox("randomizeTrainerNames", "Randomize trainer names", false, true);
        trainers.checkbox("randomizeTrainerClassNames", "Randomize trainer class names", false, true);
        trainers.checkbox("trainersForceFullyEvolved", "Force fully evolved at level", false, true);
        trainers.number("trainersForceFullyEvolvedLevel", "Fully evolved level", 30, 1, 100, 1, true);
        trainers.checkbox("trainersLevelModified", "Modify trainer levels", false, true);
        trainers.number("trainerLevelModifier", "Trainer level modifier", 0, -50, 50, 1, true);
        trainers.number("eliteFourUniquePokemonNumber", "Elite Four unique Pokemon", 0, 0, 2, 1, generation >= 3);
        trainers.checkbox("allowTrainerAlternateFormes", "Allow trainer alternate formes", false, romHandler.hasFunctionalFormes());
        trainers.checkbox("swapTrainerMegaEvos", "Swap trainer Mega Evolutions", false, romHandler.hasMegaEvolutions());
        trainers.number("additionalBossTrainerPokemon", "Extra boss Pokemon", 0, 0, 6, 1, generation >= 3);
        trainers.number("additionalImportantTrainerPokemon", "Extra important trainer Pokemon", 0, 0, 6, 1, generation >= 3);
        trainers.number("additionalRegularTrainerPokemon", "Extra regular trainer Pokemon", 0, 0, 6, 1, generation >= 3);
        trainers.checkbox("randomizeHeldItemsForBossTrainerPokemon", "Boss held items", false, generation >= 3);
        trainers.checkbox("randomizeHeldItemsForImportantTrainerPokemon", "Important trainer held items", false, generation >= 3);
        trainers.checkbox("randomizeHeldItemsForRegularTrainerPokemon", "Regular trainer held items", false, generation >= 3);
        trainers.checkbox("consumableItemsOnlyForTrainers", "Consumable trainer held items only", false, generation >= 3);
        trainers.checkbox("sensibleItemsOnlyForTrainers", "Sensible trainer held items", false, generation >= 3);
        trainers.checkbox("highestLevelGetsItemsForTrainers", "Highest-level Pokemon gets item", false, generation >= 3);
        trainers.checkbox("doubleBattleMode", "Double battle mode", false, generation >= 3);
        trainers.checkbox("shinyChance", "Random shiny trainer Pokemon", false, generation >= 7);
        trainers.checkbox("betterTrainerMovesets", "Better trainer movesets", false, generation >= 3);

        Group wild = schema.group("wild", "Wild Pokemon");
        wild.select("wildPokemon", "Wild Pokemon", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("area-1-to-1", "Random, area mapped"),
                choice("global-1-to-1", "Random, global mapped"),
                choice("completely-random", "Completely random"));
        wild.select("wildPokemonRestriction", "Wild restriction", "none",
                choice("none", "None"),
                choice("similar-strength", "Similar strength"),
                choice("catch-em-all", "Catch 'em all"),
                choice("type-theme-areas", "Type-themed areas"));
        wild.checkbox("useTimeBasedEncounters", "Use time-based encounters", false, romHandler.hasTimeBasedEncounters());
        wild.checkbox("useMinimumCatchRate", "Set minimum catch rate", false, true);
        wild.number("minimumCatchRateLevel", "Minimum catch rate level", 1, 1, 5, 1, true);
        wild.checkbox("blockWildLegendaries", "No wild legendaries", true, true);
        wild.checkbox("randomizeWildPokemonHeldItems", "Randomize wild held items", false, generation != 1);
        wild.checkbox("banBadRandomWildPokemonHeldItems", "Ban bad wild held items", false, generation != 1);
        wild.checkbox("balanceShakingGrass", "Balance shaking grass", false, generation == 5);
        wild.checkbox("wildLevelsModified", "Modify wild levels", false, true);
        wild.number("wildLevelModifier", "Wild level modifier", 0, -50, 50, 1, true);
        wild.checkbox("allowWildAltFormes", "Allow wild alternate formes", false, romHandler.hasWildAltFormes());

        Group machines = schema.group("machines", "TMs, HMs & Tutors");
        machines.select("tms", "TM/HM moves", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("random", "Random"));
        machines.checkbox("tmLevelUpMoveSanity", "TM level-up move sanity", false, true);
        machines.checkbox("keepFieldMoveTMs", "Keep field move TMs", false, true);
        machines.checkbox("fullHMCompat", "Full HM compatibility", false, generation < 7);
        machines.checkbox("tmsForceGoodDamaging", "Force good damaging TMs", false, true);
        machines.number("tmsGoodDamagingPercent", "Good damaging TM percent", 0, 0, 100, 5, true);
        machines.checkbox("blockBrokenTMMoves", "Ban game-breaking TMs", false, true);
        machines.select("tmHmCompatibility", "TM/HM compatibility", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("random-prefer-type", "Random, prefer same type"),
                choice("random-completely", "Random completely"),
                choice("full", "Full compatibility"));
        machines.checkbox("tmsFollowEvolutions", "TM compatibility follows evolutions", false, true);

        if (romHandler.hasMoveTutors()) {
            machines.select("moveTutorMoves", "Move tutor moves", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("random", "Random"));
            machines.checkbox("tutorLevelUpMoveSanity", "Tutor level-up move sanity", false, true);
            machines.checkbox("keepFieldMoveTutors", "Keep field move tutors", false, true);
            machines.checkbox("tutorsForceGoodDamaging", "Force good damaging tutors", false, true);
            machines.number("tutorsGoodDamagingPercent", "Good damaging tutor percent", 0, 0, 100, 5, true);
            machines.checkbox("blockBrokenTutorMoves", "Ban game-breaking tutors", false, true);
            machines.select("moveTutorCompatibility", "Move tutor compatibility", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("random-prefer-type", "Random, prefer same type"),
                    choice("random-completely", "Random completely"),
                    choice("full", "Full compatibility"));
            machines.checkbox("tutorFollowEvolutions", "Tutor compatibility follows evolutions", false, true);
        }

        Group items = schema.group("items", "Items");
        items.select("fieldItems", "Field items", "unchanged",
                choice("unchanged", "Unchanged"),
                choice("shuffle", "Shuffle"),
                choice("random", "Random"),
                choice("random-even", "Random, even distribution"));
        items.checkbox("banBadRandomFieldItems", "Ban bad field items", false, true);

        if (romHandler.hasShopRandomization()) {
            items.select("shopItems", "Shop items", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("shuffle", "Shuffle"),
                    choice("random", "Random"));
            items.checkbox("banBadRandomShopItems", "Ban bad shop items", false, true);
            items.checkbox("banRegularShopItems", "Ban regular shop items", false, true);
            items.checkbox("banOPShopItems", "Ban overpowered shop items", false, true);
            items.checkbox("balanceShopPrices", "Balance shop prices", false, true);
            items.checkbox("guaranteeEvolutionItems", "Guarantee evolution items", false, true);
            items.checkbox("guaranteeXItems", "Guarantee X items", false, true);
        }

        if (romHandler.abilitiesPerPokemon() > 0) {
            items.select("pickupItems", "Pickup items", "unchanged",
                    choice("unchanged", "Unchanged"),
                    choice("random", "Random"));
            items.checkbox("banBadRandomPickupItems", "Ban bad pickup items", false, true);
        }

        Group tweaks = schema.group("misc-tweaks", "Misc Tweaks");
        addMiscTweaks(tweaks, romHandler);

        return schema.toJson();
    }

    private static void addStarterChoices(Group group, RomHandler romHandler) {
        List<OptionChoice> choices = new ArrayList<>();
        choices.add(choice("0", "Unselected"));
        List<Pokemon> pokemon = romHandler.getPokemonInclFormes();
        for (int i = 1; i < pokemon.size(); i++) {
            Pokemon pkmn = pokemon.get(i);
            if (pkmn != null && pkmn.name != null && !pkmn.name.trim().isEmpty()) {
                choices.add(choice(String.valueOf(i), pkmn.name.trim()));
            }
        }
        group.select("customStarter1", "Custom starter 1", "0", choices);
        group.select("customStarter2", "Custom starter 2", "0", choices);
        group.select("customStarter3", "Custom starter 3", "0", choices);
    }

    private static void addMiscTweaks(Group group, RomHandler romHandler) {
        int available = romHandler.miscTweaksAvailable();
        for (MiscTweak tweak : MiscTweak.allTweaks) {
            if ((available & tweak.getValue()) == 0) {
                continue;
            }
            String id = "miscTweak_" + tweak.getValue();
            group.checkbox(id, tweak.getTweakName(), false, true);
        }
    }

    private static OptionChoice[] generationChoices(int min, int max) {
        List<OptionChoice> choices = new ArrayList<>();
        for (int gen = min; gen <= max; gen++) {
            choices.add(choice(String.valueOf(gen), "Generation " + gen));
        }
        return choices.toArray(new OptionChoice[0]);
    }

    private static String firstExpCurve(int generation) {
        ExpCurve[] curves = getEXPCurvesForGeneration(generation);
        return curves.length == 0 ? "MEDIUM_FAST" : curves[0].name();
    }

    private static OptionChoice[] expCurveChoices(int generation) {
        ExpCurve[] curves = getEXPCurvesForGeneration(generation);
        OptionChoice[] choices = new OptionChoice[curves.length];
        for (int i = 0; i < curves.length; i++) {
            choices[i] = choice(curves[i].name(), curves[i].toString());
        }
        return choices;
    }

    private static ExpCurve[] getEXPCurvesForGeneration(int generation) {
        if (generation <= 1) {
            return new ExpCurve[] { ExpCurve.MEDIUM_FAST, ExpCurve.MEDIUM_SLOW, ExpCurve.FAST, ExpCurve.SLOW };
        }
        return ExpCurve.values();
    }

    private static OptionChoice choice(String value, String label) {
        return new OptionChoice(value, label, false);
    }

    private static OptionChoice choice(String value, String label, boolean disabled) {
        return new OptionChoice(value, label, disabled);
    }

    private static final class Schema {
        private final List<Group> groups = new ArrayList<>();

        Group group(String id, String name) {
            Group group = new Group(id, name);
            groups.add(group);
            return group;
        }

        String toJson() {
            List<String> groupJson = new ArrayList<>();
            for (Group group : groups) {
                if (!group.options.isEmpty()) {
                    groupJson.add(group.toJson());
                }
            }
            return "{\"groups\":[" + join(groupJson) + "],\"defaults\":" + defaultsJson(groups) + "}";
        }
    }

    private static final class Group {
        private final String id;
        private final String name;
        private final List<Option> options = new ArrayList<>();

        Group(String id, String name) {
            this.id = id;
            this.name = name;
        }

        void checkbox(String id, String label, boolean defaultValue, boolean visible) {
            if (visible) {
                options.add(new Option(id, "checkbox", label, String.valueOf(defaultValue), null, null, null, null));
            }
        }

        void number(String id, String label, int defaultValue, int min, int max, int step, boolean visible) {
            if (visible) {
                options.add(new Option(id, "number", label, String.valueOf(defaultValue), null, min, max, step));
            }
        }

        void select(String id, String label, String defaultValue, OptionChoice... choices) {
            List<OptionChoice> list = new ArrayList<>();
            for (OptionChoice choice : choices) {
                if (!choice.disabled) {
                    list.add(choice);
                }
            }
            options.add(new Option(id, "select", label, defaultValue, list, null, null, null));
        }

        void select(String id, String label, String defaultValue, List<OptionChoice> choices) {
            if (!choices.isEmpty()) {
                options.add(new Option(id, "select", label, defaultValue, choices, null, null, null));
            }
        }

        String toJson() {
            List<String> optionJson = new ArrayList<>();
            for (Option option : options) {
                optionJson.add(option.toJson());
            }
            return "{"
                    + "\"id\":" + quote(id) + ","
                    + "\"name\":" + quote(name) + ","
                    + "\"options\":[" + join(optionJson) + "]"
                    + "}";
        }
    }

    private static final class Option {
        private final String id;
        private final String type;
        private final String label;
        private final String defaultValue;
        private final List<OptionChoice> choices;
        private final Integer min;
        private final Integer max;
        private final Integer step;

        Option(String id, String type, String label, String defaultValue, List<OptionChoice> choices, Integer min, Integer max, Integer step) {
            this.id = id;
            this.type = type;
            this.label = label;
            this.defaultValue = defaultValue;
            this.choices = choices;
            this.min = min;
            this.max = max;
            this.step = step;
        }

        String toJson() {
            StringBuilder out = new StringBuilder("{");
            out.append("\"id\":").append(quote(id)).append(",");
            out.append("\"type\":").append(quote(type)).append(",");
            out.append("\"label\":").append(quote(label)).append(",");
            if ("checkbox".equals(type)) {
                out.append("\"default\":").append(Boolean.parseBoolean(defaultValue));
            } else if ("number".equals(type)) {
                out.append("\"default\":").append(defaultValue);
                out.append(",\"min\":").append(min);
                out.append(",\"max\":").append(max);
                out.append(",\"step\":").append(step);
            } else {
                out.append("\"default\":").append(quote(defaultValue));
                out.append(",\"choices\":[");
                List<String> choiceJson = new ArrayList<>();
                for (OptionChoice choice : choices) {
                    choiceJson.add(choice.toJson());
                }
                out.append(join(choiceJson)).append("]");
            }
            out.append("}");
            return out.toString();
        }
    }

    private static final class OptionChoice {
        private final String value;
        private final String label;
        private final boolean disabled;

        OptionChoice(String value, String label, boolean disabled) {
            this.value = value;
            this.label = label;
            this.disabled = disabled;
        }

        String toJson() {
            return "{\"value\":" + quote(value) + ",\"label\":" + quote(label) + "}";
        }
    }

    private static String defaultsJson(List<Group> groups) {
        List<String> values = new ArrayList<>();
        for (Group group : groups) {
            for (Option option : group.options) {
                if ("checkbox".equals(option.type)) {
                    values.add(quote(option.id) + ":" + Boolean.parseBoolean(option.defaultValue));
                } else if ("number".equals(option.type)) {
                    values.add(quote(option.id) + ":" + option.defaultValue);
                } else {
                    values.add(quote(option.id) + ":" + quote(option.defaultValue));
                }
            }
        }
        return "{" + join(values) + "}";
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
}
