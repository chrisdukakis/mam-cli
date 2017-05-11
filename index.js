const IOTA = require('iota.lib.js');
const MAM = require('./mam.client.js/lib/mam');
const MerkleTree = require('./mam.client.js/lib/merkle');
const Encryption = require('./mam.client.js/lib/encryption');
const Crypto = require('crypto.iota.js');
const readline = require('readline');

const iota = new IOTA({
  provider: 'http://localhost:14900'
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

let subIndex = 0;
let subStart = 3;
let subTree0;
let subRoot;
let subRootNext;

function init(s) {
  seed = s;
  channelSeed = Encryption.hash(Crypto.converter.trits(seed.slice()));
  pubTree0 = new MerkleTree(seed, pubStart, count, security);
  pubTree1 = new MerkleTree(seed, pubStart + count, count, security);
  subTree0 = new MerkleTree(seed, subStart, count, security);
  subRoot = subTree0.root.hash.toString();
}

function publish(message) {
  channelKey = Crypto.converter.trytes(Encryption.subseed(Encryption.hash(Encryption.increment(Crypto.converter.trits(seed.slice()))), pubIndex));
  const trytes = new MAM.MaskedAuthenticatedMessage({
    message: iota.utils.toTrytes(message),
    merkleTree: pubTree0,
    index: pubIndex,
    nextRoot: pubTree1.root.hash.toString(),
    channelKey: channelKey
  });
  pubIndex++;
  if(pubIndex >= pubTree0.root.size()) {
    pubTree0 = pubTree1;
    pubStart += count;
    pubTree1 = new MerkleTree(seed, pubStart + count, count, security);
  }
  return new Promise((resolve) => {
    iota.api.sendTrytes(trytes, 4, 13, (err, tx) => {
      if (err)
        console.log('Error:', err);
      else
        console.log('Published!');
      resolve();
    });
  });
}

function sendCommand(channelKey) {
  console.log(channelKey);
  return new Promise((resolve) => {
    iota.api.sendCommand({
        command: "MAM.getMessage",
        channel: MAM.messageID(channelKey)
    }, (err, result) => {
      if(err == undefined) {
        const output = MAM.parse(result.ixi, {key: channelKey});
        const asciiMessage = iota.utils.fromTrytes(output.message);
        console.log(output.root, '->', output.nextRoot);
        if (subRoot === output.root) {
          subIndex++;
          subRootNext = output.nextRoot;
        }
        else if (subRootNext === output.root) {
          subIndex++;
          subRoot = subRootNext;
          subRootNext = output.nextRoot;
        }
        else
          console.log('Public Keys do not match!');
        console.log('Message:', asciiMessage);
      }
      else if (err.message !== 'Message not found.') {
        console.log('Error:', err);
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
    i = i ? i : subIndex;
    let key = Crypto.converter.trytes(Encryption.subseed(Encryption.hash(Encryption.increment(Crypto.converter.trits(seed.slice()))), i));
    console.log(key);
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
