import React, {useRef, useState} from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import {
  Video,
  Audio,
  MusicPlayer,
  MediaProvider,
  usePlaybackState,
  useAudioPlayer,
  useMusicPlayer,
  type VideoHandle,
  type Track,
} from 'obsidian-media-player';

const HLS_DEMO = {
  uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  type: 'hls' as const,
};

const DEMO_TRACKS: Track[] = [
  { id: '1', source: { uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' }, title: 'SoundHelix 1', artist: 'Demo' },
  { id: '2', source: { uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' }, title: 'SoundHelix 2', artist: 'Demo' },
];

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function VideoDemo() {
  const ref = useRef<VideoHandle>(null);
  const [paused, setPaused] = useState(false);
  return (
    <Section title="Video (HLS)">
      <Video
        ref={ref}
        source={HLS_DEMO}
        paused={paused}
        resizeMode="contain"
        style={{height: 200, backgroundColor: '#000', borderRadius: 12}}
        onStateChange={s => console.log('[video]', s.status)}
      />
      <View style={styles.row}>
        <Btn label={paused ? 'Play' : 'Pause'} onPress={() => setPaused(p => !p)} />
        <Btn label="Seek 10s" onPress={() => ref.current?.seek(10)} />
        <Btn label="Stop" onPress={() => ref.current?.stop()} />
      </View>
    </Section>
  );
}

function AudioDemo() {
  const {state, controls} = useAudioPlayer();
  const d = usePlaybackState(state);
  return (
    <Section title="Audio (headless)">
      <Audio source={DEMO_TRACKS[0]!.source} paused />
      <Text style={styles.mono}>{state.status} · {state.position.toFixed(1)}s / {state.duration.toFixed(1)}s</Text>
      <View style={styles.row}>
        <Btn label={d.isPlaying ? 'Pause' : 'Play'} onPress={() => (d.isPlaying ? controls.pause() : controls.play())} />
        <Btn label="Load track 1" onPress={() => controls.load(DEMO_TRACKS[0]!.source)} />
        <Btn label="Seek 5s" onPress={() => controls.seek(5)} />
      </View>
    </Section>
  );
}

function MusicDemo() {
  const {state, queue, controls} = useMusicPlayer(DEMO_TRACKS);
  const d = usePlaybackState(state);
  return (
    <Section title="Music player (queue + background)">
      <MusicPlayer tracks={DEMO_TRACKS} remoteControls={{enablePlayPause: true, enableSkip: true}} />
      <Text style={styles.mono}>queue: {queue.tracks.length} · idx {queue.index} · {state.status}</Text>
      <View style={styles.row}>
        <Btn label={d.isPlaying ? 'Pause' : 'Play'} onPress={() => (d.isPlaying ? controls.pause() : controls.play())} />
        <Btn label="Next" onPress={() => controls.next()} />
        <Btn label="Prev" onPress={() => controls.previous()} />
        <Btn label="Shuffle" onPress={() => controls.setShuffle(true)} />
      </View>
    </Section>
  );
}

function Btn({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.btn}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function App() {
  return (
    <MediaProvider initialTracks={DEMO_TRACKS} remoteControls={{enablePlayPause: true, enableSkip: true}}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.h1}>obsidian-media-player · demo</Text>
          <VideoDemo />
          <AudioDemo />
          <MusicDemo />
          <Text style={styles.hint}>Background audio + lock-screen controls work once the app is rebuilt with `pod install` / Gradle sync.</Text>
        </ScrollView>
      </SafeAreaView>
    </MediaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#0a0a0a'},
  body: {padding: 16, gap: 16},
  h1: {color: '#fff', fontSize: 22, fontWeight: '800'},
  h2: {color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8},
  section: {backgroundColor: '#1a1a1a', borderRadius: 16, padding: 12},
  row: {flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap'},
  btn: {backgroundColor: '#2a2a2a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10},
  btnText: {color: '#fff', fontWeight: '600'},
  mono: {color: '#aaa', fontFamily: 'Menlo', fontSize: 12, marginTop: 6},
  hint: {color: '#666', fontSize: 12, textAlign: 'center', marginTop: 8},
});
