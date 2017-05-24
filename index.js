const IOTA = require('iota.lib.js');
const MamClient = require('mam.client.js');
const MAM = MamClient.MAM;
const MerkleTree = MamClient.Merkle;
const Encryption = MamClient.Encryption;
const Crypto = require('crypto.iota.js');
const readline = require('readline');

const iota = new IOTA({
  provider: 'http://localhost:14600'
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
}).on('close', () => {});

const count = 4;
const security = 1;

let seed = '';
let channelSeed;
let channelKey;

let pubIndex = 0;
let pubStart = 3;
let pubTree0;
let pubTree1;

function init(s) {
  seed = s;
  channelSeed = Encryption.hash(Crypto.converter.trits(seed.slice()));
  channelKey = Crypto.converter.trytes(channelSeed.slice());
  pubTree0 = new MerkleTree(seed, pubStart, count, security);
  pubTree1 = new MerkleTree(seed, pubStart + count, count, security);
}

function publish(message) {
  return new Promise ((resolve) => {
    iota.api.sendCommand({
      command: "MAM.getMessage",
      channel: MAM.messageID(channelKey)
    }, (err, result) => {
      if (err == undefined) {
        setTimeout(() => {
          incrementPubIndex();
          publish(message).then(resolve);
        }, 1);
      }
      else
        publishMAM(message, channelKey).then(resolve);
    });
  });
}

function publishMAM(message, key) {
  const mam = new MAM.create({
    message: iota.utils.toTrytes(message),
    merkleTree: pubTree0,
    index: pubIndex,
    nextRoot: pubTree1.root.hash.toString(),
    channelKey: key
  });
  channelKey = mam.nextKey;
  incrementPubIndex();
  return new Promise((resolve) => {
    iota.api.sendTrytes(mam.trytes, 4, 13, (err, tx) => {
      if (err)
        console.log('Error:', err);
      else
        console.log('Published!');
      resolve();
    });
  });
}

function incrementPubIndex() {
  pubIndex++;
  if(pubIndex >= pubTree0.root.size()) {
    pubTree0 = pubTree1;
    pubStart += count;
    pubTree1 = new MerkleTree(seed, pubStart + count, count, security);
  }
}

function sendCommand(channelKey, subRoot, subRootNext) {
  return new Promise((resolve) => {
    iota.api.sendCommand({
      command: "MAM.getMessage",
      channel: MAM.messageID(channelKey)
    }, (err, result) => {
      if(err == undefined) {
        console.log("MSG Found for: ", channelKey);
        result.ixi.forEach( mam => {
          const output = MAM.parse({key: channelKey, message: mam.message, tag: mam.tag});
          const asciiMessage = iota.utils.fromTrytes(output.message);
          console.log(output.root, '->', output.nextRoot);
          if (subRoot === output.root) {
            subRootNext = output.nextRoot;
          }
          else if (subRootNext === output.root) {
            subRoot = subRootNext;
            subRootNext = output.nextRoot;
          }
          else {
            console.log('Public Keys do not match!');
            subRoot = output.root;
            subRootNext = output.nextRoot;
          }
          console.log('Message:', asciiMessage);
          let nextKey = output.nextKey; //Crypto.converter.trytes(MAM.channelKey(Crypto.converter.trits(channelKey), 1));
          console.log('NEXTKEY: ', nextKey);
          setTimeout(() => {
            sendCommand(nextKey, subRoot, subRootNext).then(resolve);
          }, 1);
        });
      }
      else {
        setTimeout(() => {
          sendCommand(channelKey, subRoot, subRootNext).then(resolve);
        }, 500);
      }
      resolve();
    });
  });
}

function subscribe(channelKey) {
  return new Promise((resolve) => {
    sendCommand(channelKey).then(resolve);
  });
}

const commands = {
  get: (i) => {
    console.log(channelKey);
    return new Promise((resolve) => {resolve();});
  },
  pub: () => {
    return new Promise((resolve) => {
      prompt('Type message: ', publish).then(resolve);
    });
  },
  sub: () => {
    return new Promise((resolve) => {
      prompt('Type channel key: ', checkChannelKey).then((channelKey) => {
        console.log('Fetching...');
        subscribe(channelKey).then(resolve);
      });
    });
  },
  exit: () => {
    rl.close();
    return new Promise((resolve) => {});
  }
};

prompt('Please enter your seed: ', checkSeed).then(promptCommand);

function promptCommand() {
  prompt('MAM> ', execCommand).then(() => {
    promptCommand();
  });
}

function checkSeed(seed) {
  return new Promise((resolve) => {
    if (! iota.valid.isTrytes(seed) || seed.length !== 81)
      prompt(" - Invalid seed! \nPlease enter your seed: ", checkSeed).then(resolve);
    else {
      init(seed);
      resolve();
    }
  });
}

function checkChannelKey(channelKey) {
  return new Promise((resolve) => {
    if (! iota.valid.isTrytes(channelKey) || channelKey.length !== 81)
      prompt(" - Invalid channel key! \nType channel key: ", checkChannelKey).then(resolve);
    else
      resolve(channelKey);
  });
}

function execCommand(command) {
  return new Promise((resolve) => {
    if (!(command in commands)) {
      const parts = command.split(' ');
      if ((parts[0] == 'get'))
        commands.get(parseInt(parts[1])).then(resolve);
      else
        prompt(" - Invalid command! Available commands: \n   > get (index) \n   > pub \n   > sub \n   > exit \nMAM> ", execCommand).then(resolve);
    }
    else
      commands[command]().then(resolve).catch((err) => {});
  });
}

function prompt(question, fn) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      fn(answer).then(resolve);
    });
  });
}
