// 当读取对象属性时，把副作用函数放进桶里；当设置属性时，把副作用函数从桶里取出并执行
let affectFunction = null;
// effect栈
let effectStact = [];

// 注册副作用函数的函数
function effect(fn) {
    function effectFn() {
        clearFn(effectFn);
        affectFunction = effectFn;
        effectStact.push(effectFn);
        fn();
        effectStact.pop();
        affectFunction = effectStact[effectStact.length - 1];
    }
    effectFn.relySet = [];
    effectFn(fn);
}

function clearFn(effectFn) {
    for (let rely of effectFn.relySet) {
        rely.delete(effectFn);
    }
    effectFn.relySet.length = 0;
}

const bucket = new WeakMap(); //当代理的对象不要时，该对象不会再使用，因此该及时回收对象，使用WeakMap不影响对象的垃圾回收

// 追踪函数
function track(target, key) {
    if (!affectFunction) {
        return target[key];
    }
    let keyMap = bucket.get(target);
    if (!keyMap) {
        bucket.set(target, (keyMap = new Map()));
    }
    let relySet = keyMap.get(key);
    if (!relySet) {
        keyMap.set(key, (relySet = new Set()));
    }
    relySet.add(affectFunction);
    affectFunction.relySet.push(relySet);
}

// 触发函数
function trigger(target, key) {
    let keyMap = bucket.get(target);
    if (!keyMap) {
        return
    }
    let relySet = keyMap.get(key);
    const effectToRun = new Set(relySet);
    effectToRun.forEach(effectFn => effectFn());
    // relySet && relySet.forEach((fn) => fn());
}

const data = { foo: true, bar: true };
const obj = new Proxy(data, {
    get(target, key) {
        track(target, key);
        return target[key];
    },
    set(target, key, value) {
        target[key] = value;
        trigger(target, key);
    }
})