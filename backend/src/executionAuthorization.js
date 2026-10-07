function canExecuteInRoom(room, userId) {
  return Boolean(
    room &&
    (String(room.owner_id) === String(userId) || room.is_member)
  );
}

function isExecutionFileInRoom(file, roomId) {
  return Boolean(file && String(file.room_id) === String(roomId));
}

module.exports = {
  canExecuteInRoom,
  isExecutionFileInRoom,
};