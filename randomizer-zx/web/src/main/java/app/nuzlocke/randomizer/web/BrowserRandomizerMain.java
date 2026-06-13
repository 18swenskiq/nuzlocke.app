package app.nuzlocke.randomizer.web;

public final class BrowserRandomizerMain {
    private BrowserRandomizerMain() {
    }

    public static void main(String[] args) {
        BrowserRandomizerExports.registerBridge();
    }
}
