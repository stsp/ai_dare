#!/bin/bash
# Play the walkthrough recording in Fuse with SDL's disk audio driver: the beeper goes to a raw file.
cd "${AIDARE_WORK:-$PWD}"
rm -f rzx_audio.raw
Xvfb :98 -screen 0 800x600x24 -nolisten tcp > xvfb98.log 2>&1 &
XPID=$!
sleep 2
SDL_AUDIODRIVER=disk SDL_DISKAUDIOFILE=rzx_audio.raw SDL_DISKAUDIODELAY=10 DISPLAY=:98 timeout -s KILL 900 fuse-sdl --playback original.rzx --sound --sound-freq 44100 --speed 100 --no-autosave-settings > fuse_audio.log 2>&1
echo "fuse exit $?" >> fuse_audio.log
kill -9 $XPID 2>/dev/null
ls -la rzx_audio.raw >> fuse_audio.log
echo AUDIO_DONE >> fuse_audio.log
