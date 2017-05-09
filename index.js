const IOTA = require('iota.lib.js');
const MAM = require('./mam.client.js/lib/mam');
const MerkleTree = require('./mam.client.js/lib/merkle');
const Encryption = require('./mam.client.js/lib/encryption');
const Crypto = require('crypto.iota.js');
const readline = require('readline');

const iota = new IOTA({
  provider: ''
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let seed = '';
let channelSeed;
let channelKey;
let index = 0;
const channelKeyIndex = 3;
const start = 3;
const count = 4;
const security = 1;

const tree0 = new MerkleTree(seed, start, count, security);
const tree1 = new MerkleTree(seed, start + count, count, security);

const root = tree0.root.hash.toString();

function init(s) {
  seed = s;
  channelSeed = Encryption.hash(Crypto.converter.trits(seed.slice()));
  channelKey = Crypto.converter.trytes(Encryption.subseed(channelSeed, channelKeyIndex));
}

function publish(message) {
  const trytes = new MAM.MaskedAuthenticatedMessage({
    message: iota.utils.toTrytes(message),
    merkleTree: tree0,
    index: index++,
    nextRoot: tree1.root.hash.toString(),
    channelKey: channelKey
  });
  return new Promise((resolve) => {
    iota.api.sendTrytes(trytes, 4, 9, (err, tx) => {
      if (err)
        console.log('Error:', err);
      else
        console.log('Published!');
      resolve();
    });
  });
}

function sendCommand(channelKey) {
  iota.api.sendCommand({
      command: "MAM.getMessage",
      channel: MAM.messageID(Encryption.subseed(channelKey, index))
  }, (err, result) => {
    if(err == undefined) {
      const output = MAM.parse(result.ixi, {key: channelKey});
      const asciiMessage = iota.utils.fromTrytes(output.message);
      if (root === output.root)
        console.log(output.root, '->', output.nextRoot);
      else
        console.log('Public Keys do not match!');
      console.log('Message:', asciiMessage);
      index++;
    }
    else
      console.log('Error:', err);
  });
}

function subscribe(channelKey) {
  return new Promise((resolve) => {
    const t = setInterval(() => {
      sendCommand(channelKey);
      console.log('ok');
    }, 1000);
    prompt('', (sig) => {
      clearInterval(t);
      console.log(' stopped.');
      return new Promise((resolve) => {
        promptCommand();
      });
    }).then(resolve);
  });
}

const commands = {
  get: (i) => {
    i = i ? i : index;
    return new Promise((resolve) => {
      let key = Crypto.converter.trytes(Encryption.subseed(channelKey, i));
      console.log(key);
      resolve();
    });
  },
  pub: () => {
    return new Promise((resolve) => {
      prompt('Type message: ', publish).then(resolve);
    });
  },
  sub: () => {
    return new Promise((resolve) => {
      prompt('Type channel key: ', checkChannelKey).then((channelKey) => {
        console.log(channelKey);
        subscribe(channelKey).then(resolve);
      });
    });
  },
  exit: () => {
    rl.close();
    console.log('Bye!');
    return new Promise((resolve) => {});
  }
}

prompt('Please enter your seed: ', checkSeed).then(promptCommand);

function promptCommand() {
  prompt('Type command: ', execCommand).then(() => {
    promptCommand();
  });
}

function checkSeed(seed) {
  return new Promise((resolve) => {
    if (! iota.valid.isTrytes(seed) || seed.length === 0)
      prompt(" - Invalid seed! \nPlease enter your seed: ", checkSeed).then(resolve);
    else {
      init(seed);
      resolve();
    }
  });
}

function checkChannelKey(channelKey) {
  return new Promise((resolve) => {
    if (! iota.valid.isTrytes(channelKey) || channelKey.length === 0)
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
        prompt(" - Invalid command! Available commands: get (index), pub, sub, exit \nType command: ", execCommand).then(resolve);
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
