const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    app.listen(4000, () =>
      console.log("Server Running at http://localhost:4000/")
    );
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const convertUserDbObjectToResponseObject = (dbObject) => {
  return {
    userId: dbObject.user_id,
    name: dbObject.name,
    username: dbObject.username,
    password: dbObject.password,
    gender: dbObject.gender,
  };
};

const convertFollowersDbObjectToResponseObject = (dbObject) => {
  return {
    followerId: dbObject.follower_id,
    followerUserId: dbObject.follower_user_id,
    followingUserId: dbObject.following_user_id,
  };
};

const convertTweetDbObjectToResponseObject = (dbObject) => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const convertReplyDbObjectToResponseObject = (dbObject) => {
  return {
    replyId: dbObject.reply_id,
    tweetId: dbObject.tweet_id,
    reply: dbObject.reply,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const convertLikeDbObjectToResponseObject = (dbObject) => {
  return {
    likeId: dbObject.like_id,
    tweetId: dbObject.tweet_id,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const validatePassword = (password) => {
  return password.length > 6;
};

function authenticateToken(request, response, next) {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (username, name, password, gender, location)
     VALUES
      (
       '${username}',
       '${hashedPassword}',
       '${name}',
       '${gender}',
      );`;
    if (validatePassword(password)) {
      await database.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const databaseUser = await database.get(selectUserQuery);
  if (databaseUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password
    );
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTweetQuery = `
  SELECT user.username, tweet.tweet, tweet.date_time
  FROM user
  INNER JOIN tweet
  ON tweet.user_id = user.user_id
  LIMIT 4;`;
  const tweet = await database.all(getTweetQuery);
  response.send(
    tweet.map((eachTweet) => convertTweetDbObjectToResponseObject(eachTweet))
  );
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const getAllNamesFollowingQuery = `
    SELECT user.name
    FROM user
    INNER JOIN follower 
    ON user.user_id = follower.following_id;
    WHERE follower.following_id = follower.user_id`;
  const followingNames = await database.all(getAllNamesFollowingQuery);
  response.send(
    followingNames.map((eachName) =>
      convertUserDbObjectToResponseObject(eachName)
    )
  );
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getAllNamesFollowersQuery = `
    SELECT user.name
    FROM user
    INNER JOIN follower 
    ON user.user_id = follower.following_id;
    WHERE follower.user_id = follower.user_id`;
  const followerNames = await database.all(getAllNamesFollowersQuery);
  response.send(
    followerNames.map((eachName) =>
      convertUserDbObjectToResponseObject(eachName)
    )
  );
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  try {
    const { tweetId } = request.params;
    let getLikesQuery = `
        SELECT  tweet.tweet, COUNT(like.like_id) AS likes, COUNT(reply.reply) AS replies,like.date_time
        FROM tweet
        INNER JOIN reply ON tweet.user_id = reply.user_id
        INNER JOIN like ON like.user_id = tweet.user_id
        WHERE tweet.tweet_id = '${tweetId}';`;
    const getWithId = database.all(getLikesQuery);
    if (getWithId === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(convertTweetDbObjectToResponseObject(getWithId));
    }
  } catch (e) {
    console.log(`DB ERROR:'${e.message}'`);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getWhoLikedQuery = `
    SELECT user.username AS likes
    FROM like
    INNER JOIN user ON user.user_id = like.user_id
    WHERE like.user_id = user.user_id;`;
    const getWhoLiked = database.all(getWhoLikedQuery);
    if (getWhoLiked === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(convertUserDbObjectToResponseObject(getWhoLiked));
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
    SELECT user.name, reply.reply
    FROM user
    INNER JOIN reply ON user.user_id = reply.user_id 
    WHERE user.user_id = reply.user_id ;`;
    const getReplies = await database.all(getRepliesQuery);
    if (getReplies === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send(
        getReplies.map((eachReply) =>
          convertReplyDbObjectToResponseObject(eachReply)
        )
      );
    }
  }
);
