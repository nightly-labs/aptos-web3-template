/* eslint-disable react-hooks/exhaustive-deps */
import {
  Account,
  AccountAddress,
  AptosApiType,
  Ed25519PrivateKey,
  Ed25519Signature,
  get,
  MoveVector,
  RotationProofChallenge,
  U8,
  generateRawTransaction,
  generateTransactionPayloadWithABI,
  TypeTagU8,
  TypeTagVector,
  EntryFunctionABI,
  AnyRawTransaction,
  AnyTransactionPayloadInstance,
  AptosConfig,
  InputGenerateMultiAgentRawTransactionData,
  InputGenerateTransactionData,
  InputGenerateTransactionPayloadDataWithRemoteABI,
  buildTransaction,
  generateTransactionPayload,
} from "@aptos-labs/ts-sdk";
import { AccountInfo, UserResponseStatus } from "@aptos-labs/wallet-standard";
import React, { useEffect } from "react";
import { toast } from "sonner";
import { getAdapter } from "../misc/adapter";
import { getAptos } from "../misc/aptos";
import ActionStarryButton from "./ActionStarryButton";
import StarryButton from "./StarryButton";

export async function generateTransaction(
  args: { aptosConfig: AptosConfig } & InputGenerateTransactionData
): Promise<AnyRawTransaction> {
  const payload = await buildTransactionPayload(args);
  return buildRawTransaction(args, payload);
}

export async function buildTransactionPayload(
  args: { aptosConfig: AptosConfig } & InputGenerateTransactionData
): Promise<AnyTransactionPayloadInstance> {
  const { aptosConfig, data } = args;
  // Merge in aptosConfig for remote ABI on non-script payloads
  let generateTransactionPayloadData: InputGenerateTransactionPayloadDataWithRemoteABI;
  let payload: AnyTransactionPayloadInstance;

  if ("bytecode" in data) {
    // TODO: Add ABI checking later
    payload = await generateTransactionPayload(data);
  } else if ("multisigAddress" in data) {
    generateTransactionPayloadData = {
      aptosConfig,
      multisigAddress: data.multisigAddress,
      function: data.function,
      functionArguments: data.functionArguments,
      typeArguments: data.typeArguments,
      abi: data.abi,
    };
    payload = await generateTransactionPayload(generateTransactionPayloadData);
  } else {
    generateTransactionPayloadData = {
      aptosConfig,
      function: data.function,
      functionArguments: data.functionArguments,
      typeArguments: data.typeArguments,
      abi: data.abi,
    };
    payload = await generateTransactionPayload(generateTransactionPayloadData);
  }
  return payload;
}

export async function buildRawTransaction(
  args: { aptosConfig: AptosConfig } & InputGenerateTransactionData,
  payload: AnyTransactionPayloadInstance
): Promise<AnyRawTransaction> {
  const { aptosConfig, sender, options } = args;

  let feePayerAddress;
  if (isFeePayerTransactionInput(args)) {
    feePayerAddress = AccountAddress.ZERO.toString();
  }

  if (isMultiAgentTransactionInput(args)) {
    const { secondarySignerAddresses } = args;
    return buildTransaction({
      aptosConfig,
      sender,
      payload,
      options,
      secondarySignerAddresses,
      feePayerAddress,
    });
  }

  return buildTransaction({
    aptosConfig,
    sender,
    payload,
    options,
    feePayerAddress,
  });
}

function isFeePayerTransactionInput(
  data: InputGenerateTransactionData
): boolean {
  return data.withFeePayer === true;
}

function isMultiAgentTransactionInput(
  data: InputGenerateTransactionData
): data is InputGenerateMultiAgentRawTransactionData {
  return "secondarySignerAddresses" in data;
}

const StickyHeader: React.FC = () => {
  const [userAccount, setUserAccount] = React.useState<
    AccountInfo | undefined
  >();
  useEffect(() => {
    const init = async () => {
      const adapter = await getAdapter();
      if (await adapter.canEagerConnect()) {
        try {
          const response = await adapter.connect();
          if (response.status === UserResponseStatus.APPROVED) {
            setUserAccount(response.args);
          }
        } catch (error) {
          await adapter.disconnect().catch(() => {});
          console.log(error);
        }
      }
      // Events
      adapter.on("connect", (accInfo) => {
        setUserAccount(accInfo);
      });

      adapter.on("disconnect", () => {
        setUserAccount(undefined);
        console.log("adapter disconnected");
      });

      adapter.on("accountChange", (accInfo) => {
        setUserAccount(accInfo);
      });
    };
    init();
    // Try eagerly connect
  }, []);
  return (
    <header className="fixed top-0 left-0 w-full bg-opacity-50  p-6 z-10">
      <div className="flex items-center justify-between">
        <div>
          {/* <Image
            style={{ width: '200px', cursor: 'pointer' }}
            src={NightlyLogo}
            alt='logo'
            onClick={() => {
              // redirect to nightly.app
              window.location.href = 'https://nightly.app'
            }}
          /> */}
        </div>
        <div className="flex flex-col space-y-4">
          <StarryButton
            connected={userAccount?.address !== undefined}
            onConnect={async () => {
              const adapter = await getAdapter();
              try {
                const response = await adapter.connect();
                if (response.status === UserResponseStatus.APPROVED) {
                  setUserAccount(response.args);
                  toast.success("Wallet connected!");
                } else {
                  toast.error("User rejected connection");
                }
              } catch (error) {
                toast.error("Wallet connection failed!");
                // If error, disconnect ignore error
                await adapter.disconnect().catch(() => {});
              }
            }}
            onDisconnect={async () => {
              try {
                const adapter = await getAdapter();
                await adapter.disconnect();
                setUserAccount(undefined);
              } catch (error) {
                console.log(error);
              }
            }}
            publicKey={userAccount?.address.toString()}
          />
          {userAccount?.address && (
            <>
              <ActionStarryButton
                onClick={async () => {
                  const signTransaction = async () => {
                    const adapter = await getAdapter();
                    const aptos = getAptos();
                    const transaction = await aptos.transaction.build.simple({
                      sender: userAccount!.address.toString(),
                      data: {
                        function: "0x1::coin::transfer",
                        typeArguments: ["0x1::aptos_coin::AptosCoin"],
                        functionArguments: [
                          "0x7d6735f1d1b158ea340f252e0d30c4ab5596fc12bbf5267f43ac45989b9fd520",
                          100,
                        ],
                      },
                    });
                    const signedTx = await adapter.signAndSubmitTransaction({
                      rawTransaction: transaction.rawTransaction,
                    });
                    if (signedTx.status !== UserResponseStatus.APPROVED) {
                      throw new Error("Transaction rejected");
                    }
                  };
                  toast.promise(signTransaction, {
                    loading: "Signing Transaction...",
                    success: (_) => {
                      return `Transaction signed!`;
                    },
                    error: "Operation has been rejected!",
                  });
                }}
                name="Sign and Submit"
              ></ActionStarryButton>
              <ActionStarryButton
                onClick={async () => {
                  const signTransaction = async () => {
                    const adapter = await getAdapter();
                    const aptos = getAptos();
                    const transaction = await aptos.transaction.build.simple({
                      sender: userAccount!.address.toString(),
                      data: {
                        function: "0x1::coin::transfer",
                        typeArguments: ["0x1::aptos_coin::AptosCoin"],
                        functionArguments: [
                          "0x7d6735f1d1b158ea340f252e0d30c4ab5596fc12bbf5267f43ac45989b9fd520",
                          100,
                        ],
                      },
                    });
                    const signedTx = await adapter.signTransaction({
                      rawTransaction: transaction.rawTransaction,
                    });
                    if (signedTx.status !== UserResponseStatus.APPROVED) {
                      throw new Error("Transaction rejected");
                    }
                  };
                  toast.promise(signTransaction, {
                    loading: "Signing Transaction...",
                    success: (_) => {
                      return `Transaction signed!`;
                    },
                    error: "Operation has been rejected!",
                  });
                }}
                name="Sign Transaction"
              ></ActionStarryButton>
              <ActionStarryButton
                onClick={async () => {
                  const signMessage = async () => {
                    const adapter = await getAdapter();
                    await adapter.signMessage({
                      message: "I love Nightly",
                      address: true,
                      nonce: "YOLO",
                    });
                  };
                  toast.promise(signMessage, {
                    loading: "Signing message...",
                    success: (_) => {
                      return `Message signed!`;
                    },
                    error: "Operation has been rejected!",
                  });
                }}
                name="Sign Message"
              ></ActionStarryButton>
              <ActionStarryButton
                onClick={async () => {
                  const signTransaction = async () => {
                    const adapter = await getAdapter();
                    const aptos = getAptos();

                    // const fromAccount = Account.fromPrivateKey({
                    //   privateKey: new Ed25519PrivateKey(
                    //     "912adb5babe317cb451df0baa756f51a96a1f9802f1423da53ee5fceba55201e"
                    //   ),
                    // });

                    const newAccount = Account.fromPrivateKey({
                      privateKey: new Ed25519PrivateKey(
                        // "25be971b8ef7fb9e1f8ff4a0acf6d96fb1ae1d8acc7e9b027c31f74d50475cbd"
                        // "d61ed94ca68af2ddc29c3192e8212636a80c1db369fa7a732428baeb0860c4c0"
                        "f024c1f864680aaef1117692c7a6567767975f09060a2d562884078f7b86d43a"
                      ),
                      legacy: true,
                    });

                    const { data: accountInfo } = (await get({
                      aptosConfig: aptos.config,
                      type: AptosApiType.FULLNODE,
                      originMethod: "getInfo",
                      path: `accounts/${userAccount.address.toString()}`,
                    })) as any;

                    const challenge = new RotationProofChallenge({
                      sequenceNumber: BigInt(accountInfo.sequence_number),
                      originator: userAccount.address,
                      currentAuthKey: AccountAddress.from(
                        accountInfo.authentication_key
                      ),
                      newPublicKey: newAccount.publicKey,
                    });
                    // console.log(
                    //   newAccount,
                    //   newAccount.signingScheme,
                    //   newAccount.publicKey.toString()
                    // );
                    const challengeHex = challenge.bcsToBytes();
                    const textDecoder = new TextDecoder();
                    const challengeHexString = textDecoder.decode(challengeHex);

                    const data = await adapter.signMessage({
                      message: challengeHexString,
                      nonce: accountInfo.sequence_number,
                    });
                    console.log(data);

                    // missing logic
                    const proofSignedByCurrentPrivateKey: any =
                      //@ts-expect-error
                      data.args.signature;

                    // const newSignature = new Ed25519Signature(
                    //   //@ts-expect-error
                    //   data.args.signature.data.data
                    // );
                    //@ts-expect-error
                    console.log("po", data.args.signature);

                    const proofSignedByNewPrivateKey =
                      newAccount.sign(challengeHexString);

                    const rotateAuthKeyAbi: EntryFunctionABI = {
                      typeParameters: [],
                      parameters: [
                        new TypeTagU8(),
                        TypeTagVector.u8(),
                        new TypeTagU8(),
                        TypeTagVector.u8(),
                        TypeTagVector.u8(),
                        TypeTagVector.u8(),
                      ],
                    };
                    console.log("przed", userAccount!.address.toString());
                    // const transaction = await aptos.transaction.build.simple({
                    //   sender: userAccount!.address.toString(),
                    //   data: {
                    //     function: "0x1::account::rotate_authentication_key",
                    //     typeArguments: [],

                    //     functionArguments: [
                    //       new U8(0), // from scheme
                    //       MoveVector.U8(userAccount.publicKey.toUint8Array()),
                    //       new U8(newAccount.signingScheme), // to scheme
                    //       MoveVector.U8(newAccount.publicKey.toUint8Array()),
                    //       MoveVector.U8(
                    //         proofSignedByCurrentPrivateKey.toUint8Array()
                    //       ),
                    //       MoveVector.U8(
                    //         proofSignedByNewPrivateKey.toUint8Array()
                    //       ),
                    //     ],
                    //     abi: rotateAuthKeyAbi,
                    //   },
                    // });
                    const transaction = await generateTransaction({
                      aptosConfig: aptos.config,
                      sender: userAccount!.address.toString(),
                      data: {
                        function: "0x1::account::rotate_authentication_key",
                        functionArguments: [
                          new U8(0), // from scheme
                          MoveVector.U8(userAccount.publicKey.toUint8Array()),
                          new U8(newAccount.signingScheme), // to scheme
                          MoveVector.U8(newAccount.publicKey.toUint8Array()),
                          MoveVector.U8(
                            proofSignedByCurrentPrivateKey.toUint8Array()
                          ),
                          MoveVector.U8(
                            proofSignedByNewPrivateKey.toUint8Array()
                          ),
                        ],
                        abi: rotateAuthKeyAbi,
                      },
                    });

                    const signedTx = await adapter.signAndSubmitTransaction(
                      transaction
                    );

                    if (signedTx.status !== UserResponseStatus.APPROVED) {
                      throw new Error("Transaction rejected");
                    }
                  };

                  toast.promise(signTransaction, {
                    loading: "Signing Transaction...",
                    success: (_) => {
                      return `Transaction signed!`;
                    },
                    error: (err) => {
                      console.log(err);
                      return "Operation has been rejected!";
                    },
                  });
                }}
                name="Change ownership"
              ></ActionStarryButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default StickyHeader;
