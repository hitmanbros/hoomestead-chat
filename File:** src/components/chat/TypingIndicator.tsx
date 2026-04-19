// The condition for multiple users is incorrect
if (names.length === 1) {
    text = `${names[0]} is typing...`;
} else if (names.length === 2) {
    text = `${names[0]} and ${names[1]} are typing...`;
} else {
    text = "Several people are typing...";
}
