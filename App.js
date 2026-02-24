import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  AppState,
  FlatList,
  StyleSheet,
  Platform,
  Animated,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';

const { width } = Dimensions.get('window');

const ADMIN_URL = 'https://spanel.payafrika.co.za/admin/panel';
const PUSH_URL = 'https://spanel.payafrika.co.za/admin/panel/register-push';
const AUTO_LOCK_TIME = 20 * 60 * 1000;

export default function App() {
  const webRef = useRef(null);

  const [locked, setLocked] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [slowServer, setSlowServer] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(ADMIN_URL);
  const [online, setOnline] = useState(true);

  const lastActive = useRef(Date.now());
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ---------------- START ----------------
  useEffect(() => {
    initPush();
    loadInbox();

    const unsub = NetInfo.addEventListener(state => {
      setOnline(state.isConnected);
      if (state.isConnected && webRef.current) {
        webRef.current.reload(); // auto retry when back online
      }
    });

    return () => unsub();
  }, []);

  // ---------------- INBOX ----------------
  async function loadInbox() {
    const saved = JSON.parse(
      (await SecureStore.getItemAsync('inbox')) || '[]'
    );
    setNotifications(saved);
  }

  async function saveNotification(data) {
    const old = JSON.parse(
      (await SecureStore.getItemAsync('inbox')) || '[]'
    );
    const updated = [{ ...data, time: Date.now() }, ...old].slice(0, 50);

    await SecureStore.setItemAsync('inbox', JSON.stringify(updated));
    setNotifications(updated);
  }

  // ---------------- PUSH ----------------
  async function initPush() {
    if (!Device.isDevice) return;

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync()).data;

    await fetch(PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        token,
        device: Platform.OS
      })
    });
  }

  // ---------------- AUTO LOCK ----------------
  const updateActivity = () => (lastActive.current = Date.now());

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (Date.now() - lastActive.current > AUTO_LOCK_TIME) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ---------------- PAGE LOADING ----------------
  const handleLoadStart = () => {
    setLoading(true);
    setSlowServer(false);

    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 0.85,
      duration: 700,
      useNativeDriver: false
    }).start();

    setTimeout(() => setSlowServer(true), 3000);
  };

  const handleLoadEnd = () => {
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false
    }).start(() => progressAnim.setValue(0));

    setLoading(false);
    setSlowServer(false);
  };

  const handleNavChange = nav => setCurrentUrl(nav.url);

  // ---------------- LOCK ----------------
  if (locked) {
    return (
      <SafeAreaView style={styles.lock}>
        <Text style={styles.lockText}>Session Locked</Text>
        <TouchableOpacity
          style={styles.unlock}
          onPress={() => {
            lastActive.current = Date.now();
            setLocked(false);
          }}
        >
          <Text style={{ color: '#fff' }}>Unlock</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} onTouchStart={updateActivity}>

      {/* Chrome style progress */}
      <Animated.View
        style={[
          styles.progressBar,
          {
            width: progressAnim.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%']
            })
          }
        ]}
      />

      {/* Breadcrumb */}
      <View style={styles.breadcrumb}>
        <Text numberOfLines={1} style={styles.breadcrumbText}>
          {currentUrl.replace(ADMIN_URL, '') || '/'}
        </Text>
      </View>

      {/* WebView */}
      <WebView
        ref={webRef}
        source={{ uri: ADMIN_URL }}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onNavigationStateChange={handleNavChange}
        sharedCookiesEnabled
        allowsBackForwardNavigationGestures // ✅ native swipe back
      />

      {/* Overlay Loader */}
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#00D64F" />
          <Text style={styles.overlayText}>
            {slowServer ? 'Server is responding…' : 'Loading page…'}
          </Text>
        </View>
      )}

      {/* Offline banner */}
      {!online && (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>No internet — reconnecting…</Text>
        </View>
      )}

      {/* Inbox */}
      <View style={styles.inbox}>
        <FlatList
          data={notifications}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity>
              <Text style={styles.item}>
                {item.type} — {item.tid}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressBar: {
    height: 3,
    backgroundColor: '#00D64F'
  },

  breadcrumb: {
    padding: 6,
    backgroundColor: '#111827'
  },

  breadcrumbText: {
    color: '#9CA3AF',
    fontSize: 12
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.85)',
    justifyContent: 'center',
    alignItems: 'center'
  },

  overlayText: {
    marginTop: 12,
    color: '#cbd5e1'
  },

  offline: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: '#dc2626',
    padding: 6,
    alignItems: 'center'
  },

  offlineText: {
    color: '#fff',
    fontSize: 12
  },

  inbox: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    maxHeight: 200,
    backgroundColor: '#000'
  },

  item: {
    color: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#222'
  },

  lock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000'
  },

  lockText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600'
  },

  unlock: {
    marginTop: 20,
    backgroundColor: '#00D64F',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10
  }
});