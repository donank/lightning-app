import { Store } from '../../../src/store';
import GrpcAction from '../../../src/action/grpc';
import WalletAction from '../../../src/action/wallet';
import NotificationAction from '../../../src/action/notification';
import * as logger from '../../../src/action/log';
import nock from 'nock';
import 'isomorphic-fetch';

describe('Action Wallet Unit Tests', () => {
  let store;
  let sandbox;
  let grpc;
  let wallet;
  let notification;

  beforeEach(() => {
    sandbox = sinon.createSandbox({});
    sandbox.stub(logger);
    store = new Store();
    require('../../../src/config').RETRY_DELAY = 1;
    grpc = sinon.createStubInstance(GrpcAction);
    notification = sinon.createStubInstance(NotificationAction);
    wallet = new WalletAction(store, grpc, notification);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('update()', () => {
    it('should refresh balances, exchange rate and address', async () => {
      sandbox.stub(wallet, 'getExchangeRate');
      await wallet.update();
      expect(grpc.sendCommand, 'was called thrice');
      expect(wallet.getExchangeRate, 'was called once');
    });
  });

  describe('generateSeed()', () => {
    it('should generate random seed words', async () => {
      grpc.sendUnlockerCommand.withArgs('GenSeed').resolves({
        cipher_seed_mnemonic: 'foo bar',
      });
      await wallet.generateSeed();
      expect(store.seedMnemonic, 'to equal', 'foo bar');
    });

    it('should display error notification on failure', async () => {
      grpc.sendUnlockerCommand.withArgs('GenSeed').rejects(new Error('Boom!'));
      await wallet.generateSeed();
      expect(store.seedMnemonic, 'to be', null);
      expect(notification.display, 'was called once');
    });
  });

  describe('initWallet()', () => {
    it('should init wallet', async () => {
      grpc.sendUnlockerCommand.withArgs('InitWallet').resolves();
      await wallet.initWallet({ walletPassword: 'baz', seedMnemonic: ['foo'] });
      expect(store.walletUnlocked, 'to be', true);
      expect(grpc.sendUnlockerCommand, 'was called with', 'InitWallet', {
        wallet_password: Buffer.from('baz', 'utf8'),
        cipher_seed_mnemonic: ['foo'],
      });
    });

    it('should display error notification on failure', async () => {
      grpc.sendUnlockerCommand
        .withArgs('InitWallet')
        .rejects(new Error('Boom!'));
      await wallet.initWallet({ walletPassword: 'baz', seedMnemonic: ['foo'] });
      expect(notification.display, 'was called once');
    });
  });

  describe('unlockWallet()', () => {
    it('should unlock wallet', async () => {
      grpc.sendUnlockerCommand.withArgs('UnlockWallet').resolves();
      await wallet.unlockWallet({ walletPassword: 'baz' });
      expect(store.walletUnlocked, 'to be', true);
      expect(grpc.sendUnlockerCommand, 'was called with', 'UnlockWallet', {
        wallet_password: Buffer.from('baz', 'utf8'),
      });
    });

    it('should display error notification on failure', async () => {
      grpc.sendUnlockerCommand
        .withArgs('UnlockWallet')
        .rejects(new Error('Boom!'));
      await wallet.unlockWallet({ walletPassword: 'baz' });
      expect(notification.display, 'was called once');
    });
  });

  describe('getBalance()', () => {
    it('should get wallet balance', async () => {
      grpc.sendCommand.withArgs('WalletBalance').resolves({
        total_balance: '1',
        confirmed_balance: '2',
        unconfirmed_balance: '3',
      });
      await wallet.getBalance();
      expect(store.balanceSatoshis, 'to equal', 1);
      expect(store.confirmedBalanceSatoshis, 'to equal', 2);
      expect(store.unconfirmedBalanceSatoshis, 'to equal', 3);
    });

    it('should log error on failure', async () => {
      grpc.sendCommand.rejects();
      await wallet.getBalance();
      expect(logger.error, 'was called once');
    });
  });

  describe('getChannelBalance()', () => {
    it('should get channel balance', async () => {
      grpc.sendCommand.withArgs('ChannelBalance').resolves({ balance: '1' });
      await wallet.getChannelBalance();
      expect(store.channelBalanceSatoshis, 'to equal', 1);
    });

    it('should log error on failure', async () => {
      grpc.sendCommand.rejects();
      await wallet.getChannelBalance();
      expect(logger.error, 'was called once');
    });
  });

  describe('getNewAddress()', () => {
    it('should get new address', async () => {
      grpc.sendCommand.withArgs('NewAddress').resolves({
        address: 'some-address',
      });
      await wallet.getNewAddress();
      expect(store.walletAddress, 'to equal', 'some-address');
    });

    it('should log error on failure', async () => {
      grpc.sendCommand.rejects();
      await wallet.getNewAddress();
      expect(logger.error, 'was called once');
    });
  });

  describe('getExchangeRate()', () => {
    it('should get exchange rate', async () => {
      nock('https://blockchain.info')
        .get('/tobtc')
        .query({ currency: 'usd', value: 1 })
        .reply(200, '0.00011536');
      await wallet.getExchangeRate();
      expect(store.settings.exchangeRate.usd, 'to be', 0.00011536);
    });

    it('should display notification on error', async () => {
      nock('https://blockchain.info')
        .get('/tobtc')
        .query({ currency: 'usd', value: 1 })
        .reply(500, 'Boom!');
      await wallet.getExchangeRate();
      expect(store.settings.exchangeRate.usd, 'to be', null);
      expect(logger.error, 'was called once');
    });
  });
});
