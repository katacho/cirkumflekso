'use strict';
(function () {
    const GRAVITY = -9.8;  //重力
    const ZOOM = 100;   //p2->pixiの拡大率
    const CONTAINER_SIZE = 2;    //入れ物の拡大率
    const HOLD_Y = 50;   //CFを浮かせる位置
    const SLEEP_SPEED_LIMIT = 0.5;   //静止していると判断する速度
    const SLEEP_TIME_LIMIT = 1; //静止と判断する時間
    const FIXED_TIME_STEP = 1 / 60;
    const RESULT_TEXT_Y = 200;
    const RETRY_BUTTON_Y = 400;
    const TWEET_BUTTON_Y = 500;
    const BUTTON_WIDTH = 300;
    const BUTTON_HEIGHT = 60;
    const BUTTON_TEXT_SIZE = 30;
    const CANVAS_WIDTH = 450;
    const CANVAS_HEIGHT = 750;
    const DAMPING = 0.8;//減衰率
    const FLOOR_Y = 700;    //床の高さ
    const RANKS = {
        FEK: 0,
        AĈA: 1,
        BONE: 3,
        BONEGE: 8,
        MIRINDA: 10,
        ĈEFO: 15,
        DIO: 20
    }

    let itemList = [];//CFのリスト

    let app;//pixi.js
    let world;//p2.js
    let holdCircum; //ホールドしているサーカムフレックスのbody
    let isFall = false; //CFを落としたか
    let scoreText;
    let resultText;
    let retryButton;
    let tweetButton;
    let score = 0;
    let rank;
    let gameState = 0;  //0:ゲーム中 1:ゲームオーバー
    let clickCancel = false;//リトライボタンクリック時用
    let canvasZoom; //キャンバスの拡大率

    //ディープコピー
    const copy = (array) => {
        return JSON.parse(JSON.stringify(array));
    }

    //ポリゴンデータ
    const paths = {
        circumflex: [[0.4, -0.3], [0.5, -0.3], [0, 0.3], [-0.5, -0.3], [-0.4, -0.3], [0, 0]],
        J: [[0.4, 0.5], [0.4, -0.25], [0.35, -0.35], [0.25, -0.45], [0.15, -0.5], [-0.15, -0.5], [-0.25, -0.45], [-0.35, -0.35], [-0.4, -0.25], [-0.4, 0], [-0.2, 0], [-0.2, -0.2], [-0.17, -0.27], [-0.1, -0.3], [0.1, -0.3], [0.17, -0.27], [0.2, -0.2], [0.2, 0.5]]
    };

    //重心計算
    const calcCenter = (path) => {
        let area = 0;
        const center = [0, 0];
        for (let i = 0; i < path.length; i++) {
            let p = [];
            if (i == path.length - 1) {
                p = [path[i], path[0]];
            } else {
                p = [path[i], path[i + 1]];
            }

            //三角形の面積
            const triArea = (p[0][0] * p[1][1] - p[0][1] * p[1][0]) / 2;

            //三角形の重心
            const triCenter = [(p[0][0] + p[1][0]) / 3, (p[0][1] + p[1][1]) / 3];

            area += triArea;
            center[0] += triArea * triCenter[0];
            center[1] += triArea * triCenter[1];
        }
        if (area != 0) {
            center[0] /= area;
            center[1] /= area;
        }
        return center;
    }

    //pixi->p2
    const pixiToP2X = (pixiX) => pixiX / ZOOM;
    const pixiToP2Y = (pixiY) => -(pixiY / ZOOM);

    //p2->pixi
    const p2ToPixiX = (p2X) => p2X * ZOOM;
    const p2ToPixiY = (p2Y) => -(p2Y * ZOOM);
    const p2ToPixiRad = (p2Rad) => -p2Rad;
    const p2ToPixiPath = (p2Path) => {
        let center = calcCenter(p2Path);    //重心
        return p2Path.reduce((a, b) => {
            const v = [p2ToPixiX(b[0] - center[0]), p2ToPixiY(b[1] - center[1])];
            a.push(...v);
            return a;
        }, []);
    }

    //計算
    const calc = () => {
        if (gameState === 0 && isFall && holdCircum.sleepState === p2.Body.SLEEPING) {
            isFall = false;
            createCircumflex(app.screen.width / 2, HOLD_Y);
            score++;
        }
    }

    //描画
    const render = () => {
        scoreText.text = score.toString();
        itemList.forEach((item, i) => {
            item.x = p2ToPixiX(item.body.position[0]);
            item.y = p2ToPixiY(item.body.position[1]);
            item.rotation = p2ToPixiRad(item.body.angle);
        });
        app.render(stage);
    }

    //更新
    const animate = (timestamp) => {
        calc();
        requestAnimationFrame(animate);
        world.step(FIXED_TIME_STEP);
        render();
    }

    //地面
    const createFloor = () => {
        const body = new p2.Body({
            fixedRotation: true,
            type: p2.Body.STATIC,
            position: [0, pixiToP2Y(FLOOR_Y)],
            angle: 0
        });
        body.name = 'floor';
        const planeShape = new p2.Plane();
        body.addShape(planeShape);
        world.addBody(body);

        const box = new PIXI.Graphics()
            .beginFill(0x000000)
            .drawRect(0, FLOOR_Y, CANVAS_WIDTH, CANVAS_HEIGHT)
            .endFill();

        app.stage.addChild(box);
    }

    //入れ物
    const createContainer = (pixiX, pixiY) => {
        const body = new p2.Body({
            mass: 0,
            position: [pixiToP2X(pixiX), pixiToP2Y(pixiY)],
            angle: 0
        });

        //ポリゴンの拡大
        const newPath = paths.J.map(p => { return [p[0] * CONTAINER_SIZE, p[1] * CONTAINER_SIZE] })

        body.fromPolygon(copy(newPath));
        world.addBody(body);

        const sprite = new PIXI.Graphics()
            .beginFill(0x000000)
            .drawPolygon(p2ToPixiPath(newPath));

        sprite.body = body;
        app.stage.addChild(sprite);
        itemList.push(sprite);
    }

    //サーカムフレックス
    const createCircumflex = (pixiX, pixiY) => {
        const body = new p2.Body({
            mass: 1,
            position: [pixiToP2X(pixiX), pixiToP2Y(pixiY)],
        });
        body.fromPolygon(copy(paths.circumflex));
        body.gravityScale = 0;
        body.allowSleep = false;
        body.sleepSpeedLimit = SLEEP_SPEED_LIMIT;
        body.sleepTimeLimit = SLEEP_TIME_LIMIT;
        body.name = 'cf';
        body.damping = DAMPING;
        world.addBody(body);
        holdCircum = body;

        const sprite = new PIXI.Graphics()
            .beginFill(0x000000)
            .drawPolygon(p2ToPixiPath(paths.circumflex));
        sprite.body = body;
        app.stage.addChild(sprite);
        itemList.push(sprite);
    }

    const createScoreText = () => {
        const text = new PIXI.Text('0', { fontSize: 50, fill: 0x000000 });
        text.x = 10;
        text.y = 10;
        text.zIndex = 10;
        app.stage.addChild(text);
        scoreText = text;
    }

    const createResultText = () => {
        const text = new PIXI.Text('', {
            fontSize: 50,
            fill: 0x000000,
            align: 'center'
        });
        text.x = app.screen.width / 2;
        text.y = RESULT_TEXT_Y;
        text.anchor.set(0.5);
        text.visible = false;
        text.zIndex = 10;
        app.stage.addChild(text);
        resultText = text;
    }

    const createRetryButton = () => {
        const button = new PIXI.Container();
        button.x = app.screen.width / 2 - BUTTON_WIDTH / 2;
        button.y = RETRY_BUTTON_Y - BUTTON_HEIGHT / 2;
        button.visible = false;
        app.stage.addChild(button);
        button.zIndex = 10;
        retryButton = button;

        const background = new PIXI.Graphics()
            .beginFill(0x00a960)
            .drawRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 10)
            .endFill();

        button.addChild(background);

        const text = new PIXI.Text('PEPROVI', {
            fontSize: BUTTON_TEXT_SIZE,
            fill: 0xffffff,
        });
        text.anchor.set(0.5);
        text.x = button.width / 2;
        text.y = button.height / 2;
        text.resolution = 2;
        button.addChild(text);

        button.interactive = true;
        
        const buttonClick = () => {
            clickCancel = true;
            start();            
        }
        button
            .on('click', () => {
                buttonClick();
            })
            .on('touchstart', () => {
                buttonClick();
            });

    }

    const createTweetButton = () => {
        const button = new PIXI.Container();
        button.x = app.screen.width / 2 - BUTTON_WIDTH / 2;
        button.y = TWEET_BUTTON_Y - BUTTON_HEIGHT / 2;
        button.visible = false;
        app.stage.addChild(button);
        button.zIndex = 10;
        tweetButton = button;

        const background = new PIXI.Graphics()
            .beginFill(0x00acee)
            .drawRoundedRect(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, 10)
            .endFill();

        button.addChild(background);

        const text = new PIXI.Text('PEPI', {
            fontSize: BUTTON_TEXT_SIZE,
            fill: 0xffffff,
        });
        text.anchor.set(0.5);
        text.x = button.width / 2;
        text.y = button.height / 2;
        text.resolution = 2;
        button.addChild(text);

        button.interactive = true;
        const buttonClick = () => {
            const url = `https://twitter.com/intent/tweet?text=${score}個のサーカムフレックスを積み上げました。ランクは"${rank}"です。https://katacho.github.io/cirkumflekso/`;
            if(window.open(url,"_blank")){

            }else{
              window.location.href = url;
            }
        }
        button
            .on('click', () => {
                buttonClick();
            })
            .on('touchstart', () => {
                buttonClick();
            });

    }

    const gameover = () => {
        gameState = 1;
        scoreText.visible = false;
        resultText.visible = true;
        retryButton.visible = true;
        tweetButton.visible = true;


        //スコアからランクを判定
        for (const r in RANKS) {
            if (score >= RANKS[r]) {
                rank = r;
            } else {
                break;
            }
        }
        resultText.text = `POENTO:${score}\nRANGO:${rank}`;
    }

    const start = () => {
        //spriteとbodyを全て削除
        for (const item of itemList) {
            world.removeBody(item.body);
            item.destroy();
        }
        itemList = [];
        holdCircum = null;
        isFall = false;
        score = 0;

        scoreText.visible = true;
        resultText.visible = false;
        retryButton.visible = false;
        tweetButton.visible = false;

        createContainer(app.screen.width / 2, app.screen.height - 150);
        createCircumflex(app.screen.width / 2 + 10, HOLD_Y);

        gameState = 0;
    }

    //画面サイズに合わせる
    const resizeCanvas = () => {
        const [bodyW, bodyH] = [document.body.clientWidth, document.body.clientHeight];
        if (bodyW < bodyH) {
            canvasZoom = bodyW / CANVAS_WIDTH;
            stage.style.width = `${bodyW}px`;
            stage.style.height = `${CANVAS_HEIGHT * canvasZoom}px`;
        } else {
            canvasZoom = bodyH / CANVAS_HEIGHT;
            stage.style.width = `${CANVAS_WIDTH * canvasZoom}px`;
            stage.style.height = `${bodyH}px`;
        }
        app.view.style.width = '100%';
        app.view.style.height = '100%';        
    }

    const init = () => {        
        //pixi.js
        app = new PIXI.Application({
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            backgroundColor: 0xe3e3e3,
            autoDensity: true,
        });
        const stage = document.getElementById('stage');
        stage.appendChild(app.view);
        resizeCanvas();

        //ウィンドウサイズが変更されたら
        window.addEventListener( 'resize', function() {
            resizeCanvas();
        });

        //p2.js
        world = new p2.World({
            gravity: [0, GRAVITY]
        });

        //マウスが動いている時CFが追従
        app.view.addEventListener('pointermove', (e) => {
            if (gameState === 0 && !isFall && holdCircum) {
                const rect = app.view.getBoundingClientRect();
                holdCircum.position = [pixiToP2X((e.clientX - rect.left) / canvasZoom), pixiToP2Y(HOLD_Y)];
            }
        });

        const clicked = (e) => {
            if (clickCancel) {
                clickCancel = false;
                return;
            }
            if (gameState === 0 && !isFall) {
                const rect = app.view.getBoundingClientRect();
                holdCircum.gravityScale = 1;
                holdCircum.allowSleep = true;
                isFall = true;
            }
        }

        //クリックしたときCFが落下
        app.view.addEventListener('click', (e) => {
            clicked(e);
        });
        app.view.addEventListener('touchend', (e) => {
            clicked(e);
        });

        //CFと地面が衝突したとき
        world.on('beginContact', (e) => {
            if (gameState === 0 && (e.bodyA.name === 'cf' && e.bodyB.name === 'floor') ||
                (e.bodyA.name === 'floor' && e.bodyB.name === 'cf')
            ) {
                gameover();
            }
        });

        //スリープを有効化
        world.sleepMode = p2.World.BODY_SLEEPING;

        //ソートを有効化
        app.stage.sortableChildren = true;

        createResultText();
        createRetryButton();
        createTweetButton();
        createScoreText();
        createFloor();

        requestAnimationFrame(animate);
    }

    init();

    start();
}());
