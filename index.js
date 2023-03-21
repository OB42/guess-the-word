import fs from "fs";
import * as fetch from "node-fetch";
import express from "express";
import bodyParser from "body-parser";
import * as dotenv from "dotenv";
dotenv.config();
const words = JSON.parse(fs.readFileSync("./words.json"));
const token = process.env.OPENAI_API_KEY;
function genPrompt(hard, points, word) {
  return {
    role: "system",
    content: `You are playing a game with the user.
You first have to choose a word, then the user have to guess it.
Whenever you give a hint to the user, he lose 1 point.
You should tell the user how many points he have left after each hint.
The user starts with ${points} points and the game finishes when he has zero points or when he guesses the word.
If the user guessed the word with more than 0 points left, you should say "Congratulations, you guessed right with X points left! You can play again by clicking on the "Start Game" button! END_OF_GAME_SUCCESS"
If the user have zero points left OR if he asked for the word, you should say "You have no points left. The word was ${
      words[hard ? "hard" : "easy"][word]
    }. You can play again by clicking on the "Start Game" button! END_OF_GAME_FAILURE"
If the user won you HAVE to end your message with END_OF_GAME_SUCCESS, otherwise you HAVE to end your message with END_OF_GAME_FAILURE.
After a wrong guess you have to give a new hint.
You should not reveal the word to the user unless he asks or if he guesses it.
You can give vague hints or choose rare words to make the game harder, depending on the difficulty level.
Difficulty level is: ${hard ? "HARD" : "EASY"}`,
  };
}
async function getCompletion(messages, hard, points, word) {
  try {
    const msg = [
      genPrompt(hard, points),
      {
        role: "assistant",
        content: "The word is " + words[hard ? "hard" : "easy"][word] + ".",
      },
      {
        role: "assistant",
        content:
          "Here is your first hint(the first hint doesn't reduce points):",
      },
      ...messages.map((x) => new MessagesDTO().toInfra(x)),
    ];
    const { choices } = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: msg,
          temperature: 0.5,
        }),
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        method: "POST",
      }
    ).then((x) => x.json());
    messages.push(new MessagesDTO().toDomain(choices[0].message));
    return messages;
  } catch (e) {
    console.error("error", { messages, hard, points, word }, e);
    return [
      {
        name: "game",
        txt: "An error occured, please try again later END_OF_GAME_FAILURE",
      },
    ];
  }
}
class MessagesDTO {
  toInfra(msg) {
    return {
      role: msg.name === "player" ? "user" : "assistant",
      content: msg.txt,
    };
  }
  toDomain(msg) {
    return {
      name: msg.role === "user" ? "player" : "game",
      txt: msg.content,
    };
  }
}
const app = express();
app.use(bodyParser.urlencoded());
app.use(bodyParser.json());
app.post("/play", async function (req, res) {
  const messages = req.body.messages;
  for (let i in messages) {
    if (messages[i].name != "player" && messages[i].name != "game")
      throw "not a valid name";
    if (typeof messages[i].txt != "string") throw "not a valid text";
  }
  const hard = Boolean(req.body.hard);
  const points = parseInt(req.body.points);
  const word = parseInt(req.body.word);
  if (typeof hard != "boolean") throw "invalid difficulty";
  if (typeof points != "number" || points < 1) throw "invalid points";
  if (
    typeof word != "number" ||
    word >= words[hard ? "hard" : "easy"].length ||
    word < 0
  ) {
    throw "invalid word";
  }
  const result = await getCompletion(messages, hard, points, word);
  console.log("Result for ", { messages, hard, points, word }, result);

  return res.end(JSON.stringify(result));
});
app.use(express.static("public"));
app.listen(8080);
