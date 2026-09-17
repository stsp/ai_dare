#!/bin/bash
# Play the RZX in Fuse at real speed and save a snapshot every INTERVAL seconds between START and END (wall = game seconds).
S=${DANDARE_WORK:-$PWD}   # holds dandare.rzx; snapshots go to $S/OUTDIR
START=$1; END=$2; INTERVAL=$3; OUTDIR=$4
mkdir -p $S/$OUTDIR; cd $S/$OUTDIR
Xvfb :95 -screen 0 800x600x24 -nolisten tcp > /dev/null 2>&1 &
XPID=$!
sleep 2
export DISPLAY=:95
T0=$(date +%s.%N)
fuse --playback $S/dandare.rzx --speed 100 --no-sound --no-autosave-settings > $S/fuse_snaps.log 2>&1 &
FPID=$!
sleep 3
WID=$(xdotool search --name Fuse | head -1)
xdotool windowactivate $WID 2>/dev/null; xdotool windowfocus $WID 2>/dev/null
t=$START
while [ $(echo "$t <= $END" | bc) = 1 ]; do
  while [ $(echo "$(date +%s.%N) - $T0 < $t" | bc) = 1 ]; do sleep 0.05; done
  name=$(printf "s%04d" $t)
  xdotool key F2; sleep 0.4; xdotool key Tab; sleep 0.3; xdotool type --delay 40 "$name.z80"; sleep 0.2; xdotool key Return; sleep 0.5
  echo "$name $(date +%s.%N)" >> $S/$OUTDIR/times.txt
  t=$(echo "$t + $INTERVAL" | bc)
done
kill -9 $FPID $XPID 2>/dev/null
ls $S/$OUTDIR | head -3; ls $S/$OUTDIR | wc -l
