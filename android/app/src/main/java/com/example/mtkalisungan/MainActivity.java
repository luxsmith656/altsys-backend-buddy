package com.example.mtkalisungan;

import com.getcapacitor.BridgeActivity;
import com.example.mtkalisungan.tracking.BackgroundTrailRecorderPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(BackgroundTrailRecorderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
