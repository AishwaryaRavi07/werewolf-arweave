import { Button } from "@/components/ui/button";
import { GameState } from "@/types/game";
import { useCallback, useEffect, useState } from "react";
import { useGameContext } from "../context/GameContext";
import { dryrunResult, messageResult } from "../lib/utils";
import "./WaitingRoom.css";

interface PlayerResponse {
	id?: string;
	address?: string;
	name?: string;
	displayName?: string;
	isCreator?: boolean;
}

export const WaitingRoom = () => {
	const {
		currentPlayer,
		joinedPlayers,
		setJoinedPlayers,
		setMode,
		gameState,
		setGamestate,
		setCurrentPlayer,
	} = useGameContext();
	const [isLoading, setIsLoading] = useState(true);

	console.log("Current player:", currentPlayer);
	console.log("Is creator:", currentPlayer?.isCreator);

	const fetchPlayers = useCallback(async () => {
		try {
			console.log("Fetching players for process:", gameState.gameProcess);
			const gameStateResult = await dryrunResult(gameState.gameProcess, [
				{
					name: "Action",
					value: "Get-Game-State",
				},
			]);
			console.log("Game state result:", gameStateResult);
			if (gameStateResult?.phase === "night") {
				setGamestate((prevState: GameState) => ({
					...prevState,
					phase: "night",
				}));
				setMode("night");
				setIsLoading(false);
				return;
			}
			if (gameStateResult?.phase === "lobby") {
				const result = await dryrunResult(gameState.gameProcess, [
					{
						name: "Action",
						value: "Get-Players",
					},
				]);

				console.log("Raw players result:", result);

				if (result && Array.isArray(result)) {
					const validPlayers = result
						.filter((player) => !!player)
						.map((player) => ({
							id: player.id || player.address || "",
							name: player.name || player.displayName || "",
							isCreator: Boolean(player.is_creator),
							isAlive: true,
						}))
						.filter((player) => player.id && player.name);

					console.log("Mapped players:", validPlayers);

					// Update current player's creator status if needed
					if (currentPlayer) {
						const playerData = validPlayers.find((p) => p.id === currentPlayer.id);
						console.log("Found player data:", playerData);

						if (playerData?.isCreator !== currentPlayer.isCreator) {
							setCurrentPlayer((prev) => ({
								...prev!,
								isCreator: playerData?.isCreator || false,
							}));
						}
					}

					setJoinedPlayers(validPlayers);
				}
			}
			setIsLoading(false);
		} catch (error) {
			console.error("Error in fetchPlayers:", error);
			setIsLoading(false);
		}
	}, [gameState.gameProcess, currentPlayer, setCurrentPlayer, setGamestate, setMode]);

	useEffect(() => {
		if (!gameState.gameProcess) return;

		// Initial fetch
		fetchPlayers();

		// Set up interval
		const interval = setInterval(fetchPlayers, 10000);

		// Cleanup
		return () => {
			clearInterval(interval);
		};
	}, [gameState.gameProcess, fetchPlayers]);

	useEffect(() => {
		const checkRegistration = async () => {
			if (!currentPlayer?.id) {
				console.log("No player ID found, redirecting to landing");
				setMode("landing");
				return;
			}

			try {
				const result = await dryrunResult(
					gameState.gameProcess,
					[
						{
							name: "Action",
							value: "Get-Players",
						},
					],
					{ address: currentPlayer.id }
				);

				const playerExists = result?.some((player: any) => player.id === currentPlayer.id);

				if (!playerExists) {
					console.log("Player not registered, redirecting to landing");
					setMode("landing");
				}

				console.log("Player registration check result:", result);
			} catch (error) {
				console.error("Error checking registration:", error);
				setMode("landing");
			}
		};

		checkRegistration();
	}, [gameState.gameProcess, setMode, currentPlayer?.id]);

	useEffect(() => {
		if (!currentPlayer?.isCreator) {
			const checkGameState = async () => {
				try {
					const gameStateResult = await dryrunResult(gameState.gameProcess, [
						{
							name: "Action",
							value: "Get-Game-State",
						},
					]);

					if (gameStateResult?.phase === "night") {
						const { Messages: roleMessages } = await messageResult(gameState.gameProcess, [
							{
								name: "Action",
								value: "Get-Role",
							},
						]);

						if (roleMessages?.[0]?.Data) {
							setGamestate((prevState: GameState) => ({
								...prevState,
								phase: "night",
							}));
							setMode("night");
						}
					}
				} catch (error) {
					console.error("Error checking game state:", error);
				}
			};

			const interval = setInterval(checkGameState, 10000);
			return () => clearInterval(interval);
		}
	}, [currentPlayer?.isCreator, gameState.gameProcess]);

	const handleStartGame = async () => {
		if (!currentPlayer?.isCreator) {
			console.warn("Only creator can start the game");
			return;
		}

		try {
			setIsLoading(true);
			console.log("Starting game...");

			// Start the game
			const startResult = await messageResult(gameState.gameProcess, [
				{
					name: "Action",
					value: "Start-Game",
				},
			]);

			console.log("Start game response:", startResult);

			// Verify game state
			const gameStateResult = await dryrunResult(gameState.gameProcess, [
				{
					name: "Action",
					value: "Get-Game-State",
				},
			]);

			console.log("Game state after start:", gameStateResult);

			if (gameStateResult?.phase === "night") {
				// Update game state first
				setGamestate((prevState: GameState) => ({
					...prevState,
					phase: "night",
				}));

				// Then update mode
				setMode("night");
				setIsLoading(false);
			} else {
				throw new Error(`Unexpected game state: ${gameStateResult?.phase}`);
			}
		} catch (error: any) {
			console.error("Error starting game:", error);
			setIsLoading(false);
			alert(`Failed to start game: ${error.message}`);
		}
	};

	const handleLeaveRoom = async () => {
		try {
			const { Messages } = await messageResult(gameState.gameProcess, [
				{
					name: "Action",
					value: "Leave-Game",
				},
			]);

			if (Messages?.[0]?.Data === "Left game") {
				// Reset player state
				setCurrentPlayer(null);
				// Reset game state to initial values
				setGamestate((prevState: GameState) => ({
					...prevState,
					phase: "lobby",
				}));
				// Clear joined players
				setJoinedPlayers([]);
				// Navigate back to landing
				setMode("landing");
			}
		} catch (error) {
			console.error("Error leaving room:", error);
		}
	};

	if (isLoading) {
		return <div className="waiting-room">Loading...</div>;
	}

	return (
		<div className="waiting-room">
			<h2 className="text-2xl font-bold mb-6">Waiting Room</h2>

			<div className="players-list mb-6">
				<h3 className="text-xl mb-4">Players ({joinedPlayers.length}/8)</h3>
				{joinedPlayers.map((player) => (
					<div key={player.id} className="player-card">
						<span>{player.name}</span>
						{player.isCreator && <span className="creator-badge">Creator</span>}
					</div>
				))}
			</div>

			<div className="actions flex gap-4 justify-center mt-8">
				<Button
					onClick={handleStartGame}
					disabled={joinedPlayers.length < 4 || !currentPlayer?.isCreator}
					className="px-8"
					variant="default"
					size="lg"
				>
					{currentPlayer?.isCreator
						? `Start Game ${
								joinedPlayers.length < 4 ? `(Need ${4 - joinedPlayers.length} more)` : ""
						  }`
						: "Waiting for creator to start..."}
				</Button>
				<Button onClick={handleLeaveRoom} variant="outline" size="lg" className="px-8">
					Leave Room
				</Button>
			</div>
		</div>
	);
};